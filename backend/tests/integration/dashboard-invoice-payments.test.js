import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
let userId;

afterAll(async () => {
  if (userId) await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.cardInstallment.deleteMany({ where: { userId } }),
    prisma.cardPurchase.deleteMany({ where: { userId } }),
    prisma.creditCardInvoice.deleteMany({ where: { userId } }),
    prisma.creditCard.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
  await prisma.$disconnect();
});

it("reconcilia Nubank e Inter no resumo, nos pagamentos e nos gastos por competência", async () => {
  const registration = await agent.post("/api/auth/register").send({
    name: "Auditoria de faturas", email: randomUUID() + "@example.test", password: "SenhaSintetica123", currency: "BRL",
  }).expect(201);
  userId = registration.body.user.id;
  const createAccount = async (name) => (await agent.post("/api/accounts")
    .send({ name, type: "CHECKING", initialBalance: "1000" }).expect(201)).body.account.id;
  const accountId = await createAccount("Conta principal");
  const otherAccountId = await createAccount("Conta alternativa");
  const categories = (await agent.get("/api/categories").expect(200)).body.categories;
  const food = categories.find((category) => category.name === "Alimentação");
  const fuel = categories.find((category) => category.name === "Combustível");
  const technology = (await agent.post("/api/categories").send({ name: "Tecnologia teste", type: "EXPENSE" }).expect(201)).body.category;
  const createCard = async (name, closingDay, dueDay) => (await agent.post("/api/cards")
    .send({ name, type: "CREDIT", closingDay, dueDay, creditLimit: "2000" }).expect(201)).body.card.id;
  const nubank = await createCard("Nubank", 16, 20);
  const inter = await createCard("Banco Inter", 6, 12);
  const empty = await createCard("Sem movimentos", 5, 10);
  const purchase = async (card, category, date, amount, count = 1) => (await agent.post(`/api/cards/${card}/purchases`).send({
    description: category.name + " " + date, categoryId: category.id, totalAmount: amount,
    purchaseDate: date, installmentsCount: count,
  }).expect(201)).body.purchase;
  await purchase(nubank, fuel, "2026-10-22", "150");
  await purchase(inter, fuel, "2026-10-22", "100");
  await purchase(nubank, food, "2026-10-26", "200");
  await purchase(inter, food, "2026-10-26", "80");
  const plan = await purchase(nubank, technology, "2026-10-22", "600", 3);
  expect(plan.installments.map(({ amount, invoice }) => [amount, invoice.dueDate.slice(0, 10)]))
    .toEqual([["200", "2026-11-20"], ["200", "2026-12-20"], ["200", "2027-01-20"]]);
  await purchase(inter, food, "2025-10-05", "50");
  await agent.patch(`/api/cards/${inter}`).send({ isActive: false }).expect(200);

  const dashboard = async (month = "2026-11", cardId) => (await agent.get("/api/dashboard")
    .query({ month, months: 2, ...(cardId ? { cardId } : {}) }).expect(200)).body;
  const pending = (data) => data.pendingInvoices.map(({ cardName, amount, dueDate }) => [cardName, amount, dueDate.slice(0, 10)]);
  const history = async (cardId) => (await agent.get(`/api/cards/${cardId}/invoices?status=all&month=2026-11`).expect(200)).body.invoices[0];
  const balance = async (id = accountId) => (await agent.get(`/api/accounts/${id}`).expect(200)).body.account.currentBalance;
  const pay = (id, data = {}) => agent.post(`/api/invoices/${id}/pay`).send({ accountId, date: "2026-11-15", ...data });
  const initial = await dashboard();
  expect(pending(initial)).toEqual([["Banco Inter", "180", "2026-11-12"], ["Nubank", "550", "2026-11-20"]]);
  expect(initial.summary).toMatchObject({ invoiceTotal: "730", overdueInvoiceTotal: "50", monthlyExpense: "0" });
  expect(initial.overdueInvoices).toEqual([expect.objectContaining({ cardId: inter, status: "OVERDUE", amount: "50", month: "2025-10" })]);
  expect((await dashboard("2026-12")).overdueInvoices).toEqual(expect.arrayContaining([expect.objectContaining({ month: "2025-10" })]));
  expect((await dashboard("2026-11", empty)).pendingInvoices).toEqual([]);
  expect((await dashboard("2026-11", nubank)).summary.invoiceTotal).toBe("550");
  const categoryTotals = initial.expenseBreakdown;
  expect(categoryTotals).toEqual(expect.arrayContaining([{ name: "Combustível", amount: "250" }, { name: "Alimentação", amount: "280" }]));
  const interId = (await history(inter)).id;
  const nubankId = (await history(nubank)).id;

  await pay(interId).expect(200);
  expect(pending(await dashboard()).map(([name]) => name)).toEqual(["Nubank"]);
  // Represent a settled invoice written before the new paidAmount column.
  await prisma.creditCardInvoice.update({ where: { id: interId }, data: { paidAmount: 0 } });
  expect(await history(inter)).toMatchObject({ status: "PAID", paidAmount: "180", remainingAmount: "0" });
  const interPayment = (await history(inter)).payments[0];
  await agent.delete(`/api/invoices/${interId}/payments/${interPayment.id}`).expect(200);

  const paymentId = randomUUID();
  const duplicate = await Promise.all([pay(nubankId, { paymentId, amount: "120" }), pay(nubankId, { paymentId, amount: "120" })]);
  expect(duplicate.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(duplicate.find((response) => response.status === 409).body.error.code).toBe("INVOICE_PAYMENT_DUPLICATE");
  expect(await balance()).toBe("880");
  expect((await dashboard()).summary.invoiceTotal).toBe("610");
  expect(await history(nubank)).toMatchObject({ totalAmount: "550", paidAmount: "120", remainingAmount: "430" });
  await pay(nubankId, { paymentId: randomUUID(), amount: "431" }).expect(409);
  expect(await balance()).toBe("880");
  const path = `/api/invoices/${nubankId}/payments/${paymentId}`;
  await agent.patch(`/api/transactions/${paymentId}`).send({ amount: "1" }).expect(409);
  await agent.patch(path).send({ accountId: otherAccountId, amount: "40", date: "2026-10-31" }).expect(200);
  expect(await balance()).toBe("1000");
  expect(await balance(otherAccountId)).toBe("960");
  expect((await dashboard()).summary).toMatchObject({ invoiceTotal: "690", monthlyExpense: "0" });
  expect((await dashboard("2026-10", nubank)).summary.monthlyExpense).toBe("40");

  const paid = (await pay(nubankId).expect(200)).body.invoice;
  expect(paid).toMatchObject({ status: "PAID", totalAmount: "550", paidAmount: "550", remainingAmount: "0", paidAt: "2026-11-15T00:00:00.000Z" });
  expect(pending(await dashboard()).map(([name]) => name)).toEqual(["Banco Inter"]);
  expect((await history(nubank)).installments).toHaveLength(3);
  expect((await history(nubank)).payments).toHaveLength(2);
  expect(await balance()).toBe("490");
  expect((await pay(nubankId).expect(409)).body.error.code).toBe("INVOICE_ALREADY_PAID");
  expect(await balance()).toBe("490");

  await pay(interId).expect(200);
  const settled = await dashboard();
  expect(settled.pendingInvoices).toEqual([]);
  expect(settled.summary).toMatchObject({ invoiceTotal: "0", overdueInvoiceTotal: "50", monthlyExpense: "690" });
  expect(settled.expenseBreakdown).toEqual(categoryTotals);
  expect(settled.categoryExpenses).toEqual(categoryTotals);
  expect(await balance()).toBe("310");

  const reopened = (await agent.delete(path).expect(200)).body.invoice;
  expect(reopened).toMatchObject({ status: "OPEN", totalAmount: "550", paidAmount: "510", remainingAmount: "40", paidAt: null });
  expect(reopened.payments.find((item) => item.id === paymentId).status).toBe("CANCELLED");
  expect(await balance(otherAccountId)).toBe("1000");
  await agent.delete(path).expect(404);
  expect(await balance(otherAccountId)).toBe("1000");
  expect((await dashboard()).summary.invoiceTotal).toBe("40");
  expect((await dashboard()).expenseBreakdown).toEqual(categoryTotals);
  await purchase(nubank, fuel, "2026-11-14", "5");
  expect(await history(nubank)).toMatchObject({ totalAmount: "555", paidAmount: "510", remainingAmount: "45" });
  expect((await dashboard()).expenseBreakdown).toEqual(expect.arrayContaining([{ name: "Combustível", amount: "255" }]));
});
