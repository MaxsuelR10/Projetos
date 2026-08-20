import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
const month = "2026-09";
let userId;
let accountId;
let incomeCategoryId;
let expenseCategoryId;
let invoiceId;
let pendingExpenseId;

async function dashboard() {
  const response = await agent.get(`/api/dashboard?month=${month}`);
  expect(response.status).toBe(200);
  return response.body;
}

async function cleanup() {
  if (!userId) return;
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.cardInstallment.deleteMany({ where: { userId } }),
    prisma.cardPurchase.deleteMany({ where: { userId } }),
    prisma.creditCardInvoice.deleteMany({ where: { userId } }),
    prisma.creditCard.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

describe.sequential("agregação financeira do dashboard", () => {
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it("usa a mesma fonte para cards, gráfico, a pagar e resultado mensal", async () => {
    const registration = await agent.post("/api/auth/register").send({ name: "Resumo mensal", email: `resumo-${randomUUID()}@example.test`, password: "SenhaSegura123", currency: "BRL" });
    expect(registration.status).toBe(201);
    userId = registration.body.user.id;

    const account = await agent.post("/api/accounts").send({ name: "Conta resumo", type: "DIGITAL", initialBalance: "0" });
    expect(account.status).toBe(201);
    accountId = account.body.account.id;
    const categories = await agent.get("/api/categories?status=active");
    incomeCategoryId = categories.body.categories.find((item) => item.name === "Salário").id;
    expenseCategoryId = categories.body.categories.find((item) => item.name === "Alimentação").id;

    await agent.post("/api/transactions").send({ accountId, categoryId: incomeCategoryId, type: "INCOME", description: "Receita", amount: "2000", date: "2026-09-05", status: "COMPLETED", paymentMethod: "PIX" });
    await agent.post("/api/transactions").send({ accountId, categoryId: expenseCategoryId, type: "EXPENSE", description: "Despesa comum", amount: "500", date: "2026-09-06", status: "COMPLETED", paymentMethod: "PIX" });
    const pending = await agent.post("/api/transactions").send({ accountId, categoryId: expenseCategoryId, type: "EXPENSE", description: "Conta pendente", amount: "50", date: "2026-09-07", dueDate: "2026-09-10", status: "PENDING", paymentMethod: "PIX" });
    pendingExpenseId = pending.body.transaction.id;
    await agent.post("/api/transactions").send({ accountId, categoryId: expenseCategoryId, type: "EXPENSE", description: "Conta de outubro", amount: "70", date: "2026-09-08", dueDate: "2026-10-02", status: "PENDING", paymentMethod: "PIX" });
    const cancelled = await agent.post("/api/transactions").send({ accountId, categoryId: expenseCategoryId, type: "EXPENSE", description: "Despesa cancelada", amount: "40", date: "2026-09-08", status: "PENDING", paymentMethod: "PIX" });
    expect((await agent.patch(`/api/transactions/${cancelled.body.transaction.id}/cancel`)).status).toBe(204);

    const card = await agent.post("/api/cards").send({ name: "Cartão resumo", type: "CREDIT", creditLimit: "1000", closingDay: 20, dueDay: 5 });
    const purchase = await agent.post(`/api/cards/${card.body.card.id}/purchases`).send({ categoryId: expenseCategoryId, description: "Compra no cartão", totalAmount: "300", purchaseDate: "2026-08-10", installmentsCount: 1 });
    expect(purchase.status).toBe(201);
    invoiceId = purchase.body.purchase.installments[0].invoice.id;

    const beforePayment = await dashboard();
    expect(beforePayment.summary).toMatchObject({ monthlyIncome: "2000", monthlyExpense: "850", pendingBills: "350", availableBalance: "1500", monthlyResult: "650" });
    expect(beforePayment.monthlySeries.at(-1)).toMatchObject({ label: "09/2026", income: "2000", expense: "850" });
    const october = await agent.get("/api/dashboard?month=2026-10");
    expect(october.body.summary).toMatchObject({ monthlyExpense: "70", pendingBills: "70" });
    expect(october.body.monthlySeries.at(-1)).toMatchObject({ label: "10/2026", expense: "70" });

    const paidInvoice = await agent.post(`/api/invoices/${invoiceId}/pay`).send({ accountId, categoryId: expenseCategoryId, date: "2026-09-27", paymentMethod: "PIX" });
    expect(paidInvoice.status).toBe(200);
    const completedExpense = await agent.patch(`/api/transactions/${pendingExpenseId}`).send({ status: "COMPLETED" });
    expect(completedExpense.status).toBe(200);

    const afterPayment = await dashboard();
    expect(afterPayment.summary).toMatchObject({ monthlyExpense: "850", pendingBills: "0", availableBalance: "1150", monthlyResult: "300" });
    expect(Number(afterPayment.summary.monthlyResult)).toBe(Number(afterPayment.summary.availableBalance) - Number(afterPayment.summary.monthlyExpense));
  });
});
