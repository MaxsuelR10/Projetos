import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const owner = request.agent(app);
const other = request.agent(app);
const userIds = [];
let cardA;
let cardB;
let emptyCard;
let otherCard;
let firstCategory;
let secondCategory;

const period = "startDate=2026-09-01&endDate=2026-10-31&expenseFrom=2026-09-01&expenseTo=2026-10-31&months=2";

async function dashboard(cardId, dates = period) {
  const response = await owner.get(`/api/dashboard?${dates}${cardId ? `&cardId=${cardId}` : ""}`);
  expect(response.status).toBe(200);
  return response.body;
}

async function removeUser(userId) {
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.cardInstallment.deleteMany({ where: { userId } }),
    prisma.cardPurchase.deleteMany({ where: { userId } }),
    prisma.creditCardInvoice.deleteMany({ where: { userId } }),
    prisma.creditCard.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.deleteMany({ where: { id: userId } }),
  ]);
}

describe.sequential("filtro por cartão na Dashboard", () => {
  afterAll(async () => {
    for (const userId of userIds) await removeUser(userId);
    await prisma.$disconnect();
  });

  it("prepara cartões, faturas pagas e pendentes de dois usuários", async () => {
    const ownRegistration = await owner.post("/api/auth/register").send({
      name: "Dashboard cartões",
      email: `dashboard-cards-${randomUUID()}@example.test`,
      password: "SenhaSegura123",
      currency: "BRL",
    });
    const otherRegistration = await other.post("/api/auth/register").send({
      name: "Outro dono",
      email: `dashboard-other-${randomUUID()}@example.test`,
      password: "SenhaSegura123",
      currency: "BRL",
    });
    expect(ownRegistration.status).toBe(201);
    expect(otherRegistration.status).toBe(201);
    userIds.push(ownRegistration.body.user.id, otherRegistration.body.user.id);

    const account = await owner.post("/api/accounts").send({ name: "Conta", type: "DIGITAL", initialBalance: "0" });
    expect(account.status).toBe(201);
    const accountId = account.body.account.id;
    const categories = (await owner.get("/api/categories?status=active")).body.categories;
    const incomeCategoryId = categories.find((item) => item.type === "INCOME").id;
    [firstCategory, secondCategory] = categories.filter((item) => item.type === "EXPENSE").slice(0, 2);

    const cardBody = { type: "CREDIT", creditLimit: "2000", closingDay: 20, dueDay: 5 };
    const [a, b, empty, foreign] = await Promise.all([
      owner.post("/api/cards").send({ ...cardBody, name: "Cartão A" }),
      owner.post("/api/cards").send({ ...cardBody, name: "Cartão B" }),
      owner.post("/api/cards").send({ ...cardBody, name: "Sem gastos" }),
      other.post("/api/cards").send({ ...cardBody, name: "Cartão alheio" }),
    ]);
    for (const response of [a, b, empty, foreign]) expect(response.status).toBe(201);
    cardA = a.body.card.id;
    cardB = b.body.card.id;
    emptyCard = empty.body.card.id;
    otherCard = foreign.body.card.id;

    const income = await owner.post("/api/transactions").send({
      accountId, categoryId: incomeCategoryId, type: "INCOME", description: "Salário",
      amount: "500", date: "2026-09-01", status: "COMPLETED", paymentMethod: "PIX",
    });
    const cashExpense = await owner.post("/api/transactions").send({
      accountId, categoryId: secondCategory.id, type: "EXPENSE", description: "Despesa em dinheiro",
      amount: "30", date: "2026-09-02", status: "COMPLETED", paymentMethod: "PIX",
    });
    expect(income.status).toBe(201);
    expect(cashExpense.status).toBe(201);

    const paidPurchase = await owner.post(`/api/cards/${cardA}/purchases`).send({
      categoryId: firstCategory.id, description: "Compra A paga", totalAmount: "100",
      purchaseDate: "2026-08-10", installmentsCount: 1,
    });
    const pendingPurchase = await owner.post(`/api/cards/${cardA}/purchases`).send({
      categoryId: secondCategory.id, description: "Compra A pendente", totalAmount: "60",
      purchaseDate: "2026-09-10", installmentsCount: 1,
    });
    const purchaseB = await owner.post(`/api/cards/${cardB}/purchases`).send({
      categoryId: firstCategory.id, description: "Compra B pendente", totalAmount: "90",
      purchaseDate: "2026-09-10", installmentsCount: 1,
    });
    for (const response of [paidPurchase, pendingPurchase, purchaseB]) expect(response.status).toBe(201);

    const payment = await owner.post(`/api/invoices/${paidPurchase.body.purchase.installments[0].invoice.id}/pay`).send({
      accountId, date: "2026-09-20", paymentMethod: "PIX",
    });
    expect(payment.status).toBe(200);
  });

  it("mantém os totais atuais em Todos os cartões", async () => {
    const all = await dashboard();
    expect(all.summary).toMatchObject({
      monthlyIncome: "500", monthlyExpense: "130", paidBills: "130",
      pendingBills: "150", monthlyResult: "370",
    });
    expect(all.expenseBreakdown).toEqual(expect.arrayContaining([
      { name: firstCategory.name, amount: "90" },
      { name: secondCategory.name, amount: "90" },
    ]));
  });

  it("atualiza A, B e Todos sem misturar pagamentos, parcelas e categorias", async () => {
    const a = await dashboard(cardA);
    expect(a.summary).toMatchObject({
      monthlyIncome: "500", monthlyExpense: "100", paidBills: "100",
      pendingBills: "60", monthlyResult: "-100",
    });
    expect(a.expenseBreakdown).toEqual(expect.arrayContaining([
      { name: firstCategory.name, amount: "100" },
      { name: secondCategory.name, amount: "60" },
    ]));
    const categoryTotal = a.expenseBreakdown.reduce((total, item) => total + Number(item.amount), 0);
    expect(categoryTotal).toBe(160);
    expect(a.expenseBreakdown.reduce((total, item) => total + (Number(item.amount) / categoryTotal) * 100, 0)).toBeCloseTo(100);
    expect(a.monthlySeries.at(-1)).toMatchObject({ income: "0", expense: "0" });

    const b = await dashboard(cardB);
    expect(b.summary).toMatchObject({ monthlyExpense: "0", paidBills: "0", pendingBills: "90", monthlyResult: "0" });
    expect(b.expenseBreakdown).toEqual([{ name: firstCategory.name, amount: "90" }]);

    const allAgain = await dashboard();
    expect(allAgain.summary.monthlyExpense).toBe("130");
    expect(allAgain.summary.pendingBills).toBe("150");
  });

  it("respeita simultaneamente o cartão e o período, inclusive cartão vazio", async () => {
    const september = "startDate=2026-09-01&endDate=2026-09-30&expenseFrom=2026-09-01&expenseTo=2026-09-30&months=1";
    const october = "startDate=2026-10-01&endDate=2026-10-31&expenseFrom=2026-10-01&expenseTo=2026-10-31&months=1";
    expect((await dashboard(cardA, september)).summary).toMatchObject({ monthlyExpense: "100", pendingBills: "0" });
    const octoberA = await dashboard(cardA, october);
    expect(octoberA.summary).toMatchObject({ monthlyExpense: "0", pendingBills: "60" });
    expect(octoberA.expenseBreakdown).toEqual([{ name: secondCategory.name, amount: "60" }]);

    const empty = await dashboard(emptyCard);
    expect(empty.summary).toMatchObject({ monthlyExpense: "0", paidBills: "0", pendingBills: "0", monthlyResult: "0" });
    expect(empty.expenseBreakdown).toEqual([]);
  });

  it("rejeita cartão de outro usuário e ID inválido", async () => {
    const foreign = await owner.get(`/api/dashboard?${period}&cardId=${otherCard}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("CARD_NOT_FOUND");
    const invalid = await owner.get(`/api/dashboard?${period}&cardId=inválido`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("VALIDATION_ERROR");
  });
});
