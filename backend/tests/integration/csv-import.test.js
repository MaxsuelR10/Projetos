import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
const email = `importacao-${randomUUID()}@example.test`;
let userId;
let accountId;

afterAll(async () => {
  if (userId) {
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { userId } }),
      prisma.subcategory.deleteMany({ where: { userId } }),
      prisma.category.deleteMany({ where: { userId } }),
      prisma.account.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);
  }
  await prisma.$disconnect();
});

describe.sequential("importação de extrato CSV", () => {
  it("lê, categoriza e não duplica lançamentos já importados", async () => {
    const registration = await agent.post("/api/auth/register").send({
      name: "Usuário de importação", email, password: "SenhaSegura123", currency: "BRL",
    });
    expect(registration.status).toBe(201);
    userId = registration.body.user.id;

    const account = await agent.post("/api/accounts").send({ name: "Nubank", type: "DIGITAL", initialBalance: "100" });
    expect(account.status).toBe(201);
    accountId = account.body.account.id;

    const content = "Data;Descrição;Valor\n05/09/2026;Mercado Central;-450,00\n06/09/2026;Pagamento salário;3000,00\n07/09/2026;Uber viagem;-50,00";
    const preview = await agent.post("/api/imports/csv/preview").send({ accountId, content });
    expect(preview.status).toBe(200);
    expect(preview.body.rows).toHaveLength(3);
    expect(preview.body.rows[0]).toMatchObject({ type: "EXPENSE", amount: "450.00", categoryName: "Mercado", duplicate: false });
    expect(preview.body.rows[1]).toMatchObject({ type: "INCOME", amount: "3000.00", categoryName: "Salário", duplicate: false });
    expect(preview.body.rows[2]).toMatchObject({ type: "EXPENSE", amount: "50.00", categoryName: "Transporte", duplicate: false });

    const rows = preview.body.rows.map(({ date, description, amount, type, categoryId, duplicate }) => ({ date, description, amount, type, categoryId, duplicate }));
    const imported = await agent.post("/api/imports/csv/commit").send({ accountId, rows });
    expect(imported.status).toBe(201);
    expect(imported.body).toMatchObject({ imported: 3, skipped: 0 });

    const movements = await agent.get(`/api/transactions?accountId=${accountId}&from=2026-09-01&to=2026-09-30&limit=10`);
    expect(movements.status).toBe(200);
    expect(movements.body.transactions).toHaveLength(3);
    expect(movements.body.transactions.map((item) => item.description)).toEqual(expect.arrayContaining(["Mercado Central", "Pagamento salário", "Uber viagem"]));
    expect(movements.body.transactions.every((item) => item.status === "COMPLETED" && item.paymentMethod === "OTHER" && item.notes === "Importado de extrato CSV")).toBe(true);

    const expenses = await agent.get(`/api/transactions?accountId=${accountId}&type=EXPENSE&from=2026-09-01&to=2026-09-30&limit=10`);
    expect(expenses.status).toBe(200);
    expect(expenses.body.transactions).toHaveLength(2);

    const duplicatePreview = await agent.post("/api/imports/csv/preview").send({ accountId, content });
    expect(duplicatePreview.status).toBe(200);
    expect(duplicatePreview.body.rows.every((row) => row.duplicate)).toBe(true);

    const storedAccount = await agent.get(`/api/accounts/${accountId}`);
    expect(storedAccount.body.account.currentBalance).toBe("2600");

    const dashboard = await agent.get("/api/dashboard?month=2026-09&months=3");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.summary).toMatchObject({ availableBalance: "2600", monthlyIncome: "3000", monthlyExpense: "500", monthlyResult: "2500", paidBills: "500", pendingBills: "0" });
    expect(dashboard.body.categoryExpenses).toEqual(expect.arrayContaining([{ name: "Mercado", amount: "450" }, { name: "Transporte", amount: "50" }]));
    expect(dashboard.body.monthlySeries.at(-1)).toMatchObject({ label: "09/2026", income: "3000", expense: "500" });
  });

  it("salva em lote um extrato Nubank com vinte lançamentos sem estourar a transação", async () => {
    const content = [
      "date,title,amount",
      ...Array.from({ length: 20 }, (_, index) => `2026-09-08,Compra Nubank ${index + 1},-1.00`),
    ].join("\n");
    const preview = await agent.post("/api/imports/csv/preview").send({ accountId, content });
    expect(preview.status).toBe(200);
    expect(preview.body.rows).toHaveLength(20);

    const rows = preview.body.rows.map(({ date, description, amount, type, categoryId, duplicate }) => ({ date, description, amount, type, categoryId, duplicate }));
    const imported = await agent.post("/api/imports/csv/commit").send({ accountId, rows });
    expect(imported.status).toBe(201);
    expect(imported.body).toMatchObject({ imported: 20, skipped: 0 });

    const storedAccount = await agent.get(`/api/accounts/${accountId}`);
    expect(storedAccount.status).toBe(200);
    expect(storedAccount.body.account.currentBalance).toBe("2580");
  });
});
