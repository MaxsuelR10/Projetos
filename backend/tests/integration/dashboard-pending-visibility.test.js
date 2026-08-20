import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
let userId;
let accountId;
let expenseCategoryId;
let pendingId;

async function cleanup() {
  if (!userId) return;
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

describe.sequential("visibilidade de lancamentos pendentes", () => {
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it("mantem pendencia em movimentos, a pagar e saldo projetado", async () => {
    const registration = await agent.post("/api/auth/register").send({ name: "Pendencia visivel", email: `pendencia-${randomUUID()}@example.test`, password: "SenhaSegura123", currency: "BRL" });
    expect(registration.status).toBe(201); userId = registration.body.user.id;
    const account = await agent.post("/api/accounts").send({ name: "Conta pendente", type: "DIGITAL", initialBalance: "0" });
    accountId = account.body.account.id;
    const categories = await agent.get("/api/categories?type=EXPENSE&status=active");
    expenseCategoryId = categories.body.categories.find((item) => item.name === "Alimentação").id;
    const created = await agent.post("/api/transactions").send({ accountId, categoryId: expenseCategoryId, type: "EXPENSE", description: "Conta futura", amount: "865.67", date: "2026-08-11", dueDate: "2026-08-31", status: "PENDING", paymentMethod: "PIX" });
    expect(created.status).toBe(201); pendingId = created.body.transaction.id;

    const movements = await agent.get("/api/transactions?limit=20");
    expect(movements.body.transactions.find((item) => item.id === pendingId)).toMatchObject({ status: "PENDING", amount: "865.67" });
    const accountAfterCreation = await agent.get(`/api/accounts/${accountId}`);
    expect(accountAfterCreation.body.account).toMatchObject({ currentBalance: "0", projectedBalance: "0", pendingCommitments: "0" });
    const dashboard = await agent.get("/api/dashboard?month=2026-08");
    expect(dashboard.body.summary).toMatchObject({ pendingBills: "865.67", totalCardUsed: "0" });

    const overdue = await agent.patch(`/api/transactions/${pendingId}`).send({ status: "OVERDUE" });
    expect(overdue.status).toBe(200);
    const accountAfterDue = await agent.get(`/api/accounts/${accountId}`);
    expect(accountAfterDue.body.account).toMatchObject({ projectedBalance: "-865.67", pendingCommitments: "865.67" });
    const dashboardAfterDue = await agent.get("/api/dashboard?month=2026-08");
    expect(dashboardAfterDue.body.summary.pendingBills).toBe("865.67");

    const cancelled = await agent.patch(`/api/transactions/${pendingId}/cancel`);
    expect(cancelled.status).toBe(204);
    const afterCancellation = await agent.get("/api/transactions?limit=20");
    expect(afterCancellation.body.transactions.find((item) => item.id === pendingId).status).toBe("CANCELLED");
  });
});
