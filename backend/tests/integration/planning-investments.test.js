import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
let userId; let accountId; let categoryId; let investmentId;

async function cleanup() {
  if (!userId) return;
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }), prisma.budget.deleteMany({ where: { userId } }),
    prisma.financialGoal.deleteMany({ where: { userId } }), prisma.investment.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }), prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

describe.sequential("planejamento e investimentos validados", () => {
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it("prepara o usuário e rejeita períodos inválidos", async () => {
    const registration = await agent.post("/api/auth/register").send({ name: "Planejamento", email: `planning-${randomUUID()}@example.test`, password: "SenhaSegura123", currency: "BRL" });
    expect(registration.status).toBe(201); userId = registration.body.user.id;
    accountId = (await agent.post("/api/accounts").send({ name: "Conta", type: "DIGITAL", initialBalance: "500" })).body.account.id;
    const categories = await agent.get("/api/categories?type=EXPENSE&status=active");
    categoryId = categories.body.categories.find((item) => item.name === "Alimentação").id;
    expect((await agent.get("/api/planning/budgets?year=2026&month=13")).status).toBe(400);
  });

  it("calcula orçamento por competência sem usar ponto flutuante", async () => {
    expect((await agent.post("/api/planning/budgets").send({ categoryId, year: 2026, month: 9, limitAmount: "500.10" })).status).toBe(201);
    await agent.post("/api/transactions").send({ accountId, categoryId, type: "EXPENSE", description: "Pendente", amount: "100.05", date: "2026-09-01", status: "PENDING", paymentMethod: "PIX" });
    await agent.post("/api/transactions").send({ accountId, categoryId, type: "EXPENSE", description: "Pago", amount: "50.05", date: "2026-09-02", status: "COMPLETED", paymentMethod: "PIX" });
    const budgets = await agent.get("/api/planning/budgets?year=2026&month=9");
    expect(budgets.status).toBe(200);
    expect(budgets.body.budgets[0]).toMatchObject({ limitAmount: "500.1", usedAmount: "150.1" });
  });

  it("aceita meta e valor atual de investimento iguais a zero", async () => {
    const goal = await agent.post("/api/planning/goals").send({ name: "Reserva", targetAmount: "1000", currentAmount: "0", accountId });
    expect(goal.status).toBe(201); expect(goal.body.goal.progress).toBe(0);
    const investment = await agent.post("/api/investments").send({ name: "Ativo zerado", type: "CDB", investedAmount: "100.01", currentAmount: "0", applicationDate: "2026-09-01", yieldType: "CUSTOM" });
    expect(investment.status).toBe(201); investmentId = investment.body.investment.id;
    expect((await agent.patch(`/api/investments/${investmentId}`).send({ currentAmount: "0" })).status).toBe(200);
    const listed = await agent.get("/api/investments");
    expect(listed.body).toMatchObject({ totalInvested: "100.01", totalCurrent: "0" });
  });
});
