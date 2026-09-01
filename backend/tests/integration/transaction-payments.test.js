import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
let userId;
let accountId;
let secondAccountId;
let expenseCategoryId;

async function cleanup() {
  if (!userId) return;
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

describe.sequential("baixa de despesas", () => {
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it("prepara contas e categoria", async () => {
    const registration = await agent.post("/api/auth/register").send({
      name: "Pagamento de teste", email: `pagamento-${randomUUID()}@example.test`, password: "SenhaSegura123", currency: "BRL",
    });
    expect(registration.status).toBe(201);
    userId = registration.body.user.id;
    const account = await agent.post("/api/accounts").send({ name: "Conta PIX", type: "DIGITAL", initialBalance: "2000" });
    accountId = account.body.account.id;
    const secondAccount = await agent.post("/api/accounts").send({ name: "Conta transferência", type: "CHECKING", initialBalance: "100" });
    secondAccountId = secondAccount.body.account.id;
    const categories = await agent.get("/api/categories?type=EXPENSE&status=active");
    expenseCategoryId = categories.body.categories.find((item) => item.name === "Alimentação").id;
  });

  it("baixa PIX uma vez, preserva a competência e mantém histórico", async () => {
    const created = await agent.post("/api/transactions").send({
      accountId, categoryId: expenseCategoryId, type: "EXPENSE", description: "Internet", amount: "100", date: "2026-08-01", dueDate: "2026-08-10", status: "PENDING", paymentMethod: "PIX",
    });
    expect(created.status).toBe(201);
    const paid = await agent.post(`/api/transactions/${created.body.transaction.id}/pay`).send({ accountId, date: "2026-08-09" });
    expect(paid.status).toBe(200);
    expect(paid.body.transaction).toMatchObject({ status: "COMPLETED", accountId });
    expect(paid.body.transaction.date).toContain("2026-08-01");
    expect(paid.body.transaction.dueDate).toContain("2026-08-10");
    expect(paid.body.transaction.settledAt).toContain("2026-08-09");
    expect((await agent.get(`/api/accounts/${accountId}`)).body.account.currentBalance).toBe("1900");
    expect((await agent.post(`/api/transactions/${created.body.transaction.id}/pay`).send({ accountId, date: "2026-08-09" })).status).toBe(409);
    expect((await agent.get(`/api/transactions/${created.body.transaction.id}`)).body.transaction.status).toBe("COMPLETED");
  });

  it("baixa transferência na conta escolhida e aceita dinheiro sem conta", async () => {
    const transfer = await agent.post("/api/transactions").send({
      accountId, categoryId: expenseCategoryId, type: "EXPENSE", description: "Fornecedor", amount: "25", date: "2026-08-02", status: "PENDING", paymentMethod: "BANK_TRANSFER",
    });
    expect((await agent.post(`/api/transactions/${transfer.body.transaction.id}/pay`).send({ accountId: secondAccountId, date: "2026-08-03" })).status).toBe(200);
    expect((await agent.get(`/api/accounts/${secondAccountId}`)).body.account.currentBalance).toBe("75");

    const cash = await agent.post("/api/transactions").send({
      accountId: null, categoryId: expenseCategoryId, type: "EXPENSE", description: "Café em dinheiro", amount: "8", date: "2026-08-02", status: "PENDING", paymentMethod: "CASH",
    });
    expect(cash.status).toBe(201);
    const paidCash = await agent.post(`/api/transactions/${cash.body.transaction.id}/pay`).send({ accountId: null, date: "2026-08-03" });
    expect(paidCash.status).toBe(200);
    expect(paidCash.body.transaction).toMatchObject({ status: "COMPLETED", accountId: null });
    expect((await agent.get(`/api/accounts/${accountId}`)).body.account.currentBalance).toBe("1900");
  });
});
