import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
const today = new Date();
const date = today.toISOString().slice(0, 10);
const month = date.slice(0, 7);
const previousMonthDate = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
);
const previousMonth = `${previousMonthDate.getUTCFullYear()}-${String(previousMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
let userId;
let accountId;
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

async function dashboard(selectedMonth = month) {
  const response = await agent.get(`/api/dashboard?month=${selectedMonth}`);
  expect(response.status).toBe(200);
  return response.body.summary;
}

describe.sequential("resultado mensal do dashboard", () => {
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("calcula receitas menos despesas do período e respeita o seletor de mês", async () => {
    const registration = await agent
      .post("/api/auth/register")
      .send({
        name: "Resultado mensal",
        email: `resultado-${randomUUID()}@example.test`,
        password: "SenhaSegura123",
        currency: "BRL",
      });
    expect(registration.status).toBe(201);
    userId = registration.body.user.id;

    const account = await agent
      .post("/api/accounts")
      .send({
        name: "Conta principal",
        type: "DIGITAL",
        initialBalance: "2275.67",
      });
    expect(account.status).toBe(201);
    accountId = account.body.account.id;
    const categories = await agent.get("/api/categories?status=active");
    expenseCategoryId = categories.body.categories.find(
      (item) => item.name === "Alimentação",
    ).id;
    const incomeCategoryId = categories.body.categories.find(
      (item) => item.name === "Salário",
    ).id;

    await agent
      .post("/api/transactions")
      .send({
        accountId,
        categoryId: incomeCategoryId,
        type: "INCOME",
        description: "Receita do período",
        amount: "3000",
        date,
        status: "COMPLETED",
        paymentMethod: "PIX",
      });

    const expense = await agent
      .post("/api/transactions")
      .send({
        accountId,
        categoryId: expenseCategoryId,
        type: "EXPENSE",
        description: "Despesa do período",
        amount: "865.67",
        date,
        status: "COMPLETED",
        paymentMethod: "PIX",
      });
    expect(expense.status).toBe(201);

    expect(await dashboard()).toMatchObject({
      availableBalance: "4410",
      monthlyIncome: "3000",
      monthlyExpense: "865.67",
      monthlyResult: "2134.33",
    });
    expect(await dashboard(previousMonth)).toMatchObject({
      availableBalance: "4410",
      monthlyIncome: "0",
      monthlyExpense: "0",
      monthlyResult: "0",
    });
  });

  it("atualiza o resultado após criar, editar, cancelar, pagar e excluir lançamentos", async () => {
    const roundingAccount = await agent
      .post("/api/accounts")
      .send({
        name: "Ajuste de centavos",
        type: "CASH",
        initialBalance: "0.33",
      });
    expect(roundingAccount.status).toBe(201);
    const zeroResult = await agent
      .post("/api/transactions")
      .send({
        accountId,
        categoryId: expenseCategoryId,
        type: "EXPENSE",
        description: "Despesa adicional",
        amount: "272.33",
        date,
        status: "COMPLETED",
        paymentMethod: "PIX",
      });
    expect(zeroResult.status).toBe(201);
    expect(await dashboard()).toMatchObject({
      availableBalance: "4138",
      monthlyIncome: "3000",
      monthlyExpense: "1138",
      monthlyResult: "1862",
    });

    const updated = await agent
      .patch(`/api/transactions/${zeroResult.body.transaction.id}`)
      .send({ amount: "800" });
    expect(updated.status).toBe(200);
    expect(await dashboard()).toMatchObject({
      availableBalance: "3610.33",
      monthlyIncome: "3000",
      monthlyExpense: "1665.67",
      monthlyResult: "1334.33",
    });

    const cancelled = await agent.patch(
      `/api/transactions/${zeroResult.body.transaction.id}/cancel`,
    );
    expect(cancelled.status).toBe(204);
    expect(await dashboard()).toMatchObject({
      availableBalance: "4410.33",
      monthlyIncome: "3000",
      monthlyExpense: "865.67",
      monthlyResult: "2134.33",
    });

    const pending = await agent
      .post("/api/transactions")
      .send({
        accountId,
        categoryId: expenseCategoryId,
        type: "EXPENSE",
        description: "Despesa a pagar",
        amount: "500",
        date,
        dueDate: date,
        status: "PENDING",
        paymentMethod: "PIX",
      });
    expect(pending.status).toBe(201);
    expect(await dashboard()).toMatchObject({
      availableBalance: "4410.33",
      monthlyIncome: "3000",
      monthlyExpense: "1365.67",
      monthlyResult: "1634.33",
    });

    const paid = await agent
      .patch(`/api/transactions/${pending.body.transaction.id}`)
      .send({ status: "COMPLETED" });
    expect(paid.status).toBe(200);
    expect(await dashboard()).toMatchObject({
      availableBalance: "3910.33",
      monthlyIncome: "3000",
      monthlyExpense: "1365.67",
      monthlyResult: "1634.33",
    });

    const deleted = await agent.delete(
      `/api/transactions/${pending.body.transaction.id}`,
    );
    expect(deleted.status).toBe(204);
    expect(await dashboard()).toMatchObject({
      availableBalance: "4410.33",
      monthlyIncome: "3000",
      monthlyExpense: "865.67",
      monthlyResult: "2134.33",
    });
  });
});
