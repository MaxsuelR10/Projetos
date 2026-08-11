import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const suffix = randomUUID();
const password = "SenhaSegura123";
const primaryAgent = request.agent(app);
const secondaryAgent = request.agent(app);
let primaryUserId;
let secondaryUserId;
let primaryAccountId;
let destinationAccountId;
let incomeCategoryId;
let expenseCategoryId;

async function register(agent, email) {
  const response = await agent.post("/api/auth/register").send({ name: "Usuário de testes", email, password, currency: "BRL" });
  expect(response.status).toBe(201);
  return response.body.user.id;
}

async function createAccount(agent, name, initialBalance = "0") {
  const response = await agent.post("/api/accounts").send({ name, type: "DIGITAL", initialBalance });
  expect(response.status).toBe(201);
  return response.body.account.id;
}

async function balance(agent, id) {
  const response = await agent.get(`/api/accounts/${id}`);
  expect(response.status).toBe(200);
  return response.body.account.currentBalance;
}

async function cleanup(userId) {
  if (!userId) return;
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.transfer.deleteMany({ where: { userId } }),
    prisma.subcategory.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

describe.sequential("lançamentos e transferências", () => {
  afterAll(async () => {
    await cleanup(primaryUserId);
    await cleanup(secondaryUserId);
    await prisma.$disconnect();
  });

  it("prepara usuários, contas e categorias", async () => {
    primaryUserId = await register(primaryAgent, `movimentos-${suffix}@example.test`);
    secondaryUserId = await register(secondaryAgent, `isolamento-movimentos-${suffix}@example.test`);
    primaryAccountId = await createAccount(primaryAgent, "Conta principal", "100");
    destinationAccountId = await createAccount(primaryAgent, "Reserva", "0");
    await createAccount(secondaryAgent, "Conta privada", "0");

    const categories = await primaryAgent.get("/api/categories?status=active");
    incomeCategoryId = categories.body.categories.find((category) => category.name === "Salário").id;
    expenseCategoryId = categories.body.categories.find((category) => category.name === "Alimentação").id;
  });

  it("aplica somente lançamentos concluídos ao saldo e permite concluir pendências", async () => {
    const income = await primaryAgent.post("/api/transactions").send({
      accountId: primaryAccountId, categoryId: incomeCategoryId, type: "INCOME", description: "Salário", amount: "1000.00", date: "2026-08-11", status: "COMPLETED", paymentMethod: "PIX",
    });
    expect(income.status).toBe(201);
    expect(income.body.transaction.amount).toBe("1000");
    expect(await balance(primaryAgent, primaryAccountId)).toBe("1100");

    const pendingExpense = await primaryAgent.post("/api/transactions").send({
      accountId: primaryAccountId, categoryId: expenseCategoryId, type: "EXPENSE", description: "Mercado", amount: "125.50", date: "2026-08-11", status: "PENDING", paymentMethod: "DEBIT_CARD",
    });
    expect(pendingExpense.status).toBe(201);
    expect(await balance(primaryAgent, primaryAccountId)).toBe("1100");

    const complete = await primaryAgent.patch(`/api/transactions/${pendingExpense.body.transaction.id}`).send({ status: "COMPLETED" });
    expect(complete.status).toBe(200);
    expect(await balance(primaryAgent, primaryAccountId)).toBe("974.5");

    const updateAmount = await primaryAgent.patch(`/api/transactions/${pendingExpense.body.transaction.id}`).send({ amount: "200.00" });
    expect(updateAmount.status).toBe(200);
    expect(await balance(primaryAgent, primaryAccountId)).toBe("900");

    const cancellation = await primaryAgent.delete(`/api/transactions/${pendingExpense.body.transaction.id}`);
    expect(cancellation.status).toBe(204);
    expect(await balance(primaryAgent, primaryAccountId)).toBe("1100");
  });

  it("valida categoria e bloqueia dados de outro usuário", async () => {
    const invalidType = await primaryAgent.post("/api/transactions").send({
      accountId: primaryAccountId, categoryId: expenseCategoryId, type: "INCOME", description: "Incompatível", amount: "1", date: "2026-08-11",
    });
    expect(invalidType.status).toBe(400);
    expect(invalidType.body.error.code).toBe("CATEGORY_TYPE_MISMATCH");

    const isolated = await secondaryAgent.post("/api/transactions").send({
      accountId: primaryAccountId, categoryId: expenseCategoryId, type: "EXPENSE", description: "Tentativa", amount: "1", date: "2026-08-11",
    });
    expect(isolated.status).toBe(404);
  });

  it("transfere atomicamente, é idempotente e pode ser estornada", async () => {
    const key = randomUUID();
    const payload = { fromAccountId: primaryAccountId, toAccountId: destinationAccountId, amount: "300.00", date: "2026-08-11", description: "Reserva mensal", idempotencyKey: key };
    const created = await primaryAgent.post("/api/transfers").send(payload);
    expect(created.status).toBe(201);
    expect(await balance(primaryAgent, primaryAccountId)).toBe("800");
    expect(await balance(primaryAgent, destinationAccountId)).toBe("300");

    const repeated = await primaryAgent.post("/api/transfers").send(payload);
    expect(repeated.status).toBe(200);
    expect(repeated.body.idempotent).toBe(true);
    expect(await balance(primaryAgent, primaryAccountId)).toBe("800");

    const sameAccount = await primaryAgent.post("/api/transfers").send({ ...payload, toAccountId: primaryAccountId, idempotencyKey: randomUUID() });
    expect(sameAccount.status).toBe(400);

    const reversed = await primaryAgent.delete(`/api/transfers/${created.body.transfer.id}`);
    expect(reversed.status).toBe(200);
    expect(reversed.body.transfer.isReversed).toBe(true);
    expect(await balance(primaryAgent, primaryAccountId)).toBe("1100");
    expect(await balance(primaryAgent, destinationAccountId)).toBe("0");
  });
});
