import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
const email = `importacao-${randomUUID()}@example.test`;
let userId;
let accountId;
let cardId;

afterAll(async () => {
  if (userId) {
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { userId } }),
      prisma.cardInstallment.deleteMany({ where: { userId } }),
      prisma.cardPurchase.deleteMany({ where: { userId } }),
      prisma.creditCardInvoice.deleteMany({ where: { userId } }),
      prisma.creditCard.deleteMany({ where: { userId } }),
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

    const incomeOnlyPreview = await agent.post("/api/imports/csv/preview").send({ accountId, content, type: "INCOME" });
    expect(incomeOnlyPreview.status).toBe(200);
    expect(incomeOnlyPreview.body.rows.every((row) => row.type === "INCOME")).toBe(true);
    expect(incomeOnlyPreview.body.rows[0]).toMatchObject({ categoryName: "Outros" });

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

  it("importa compras do cartão Nubank para a fatura sem baixar o saldo da conta", async () => {
    const card = await agent.post("/api/cards").send({
      name: "Nubank crédito", institution: "Nubank", type: "CREDIT", creditLimit: "2000", closingDay: 15, dueDay: 20,
    });
    expect(card.status).toBe(201);
    cardId = card.body.card.id;

    const content = "date,title,amount\n2026-09-05,Restaurante Nubank,-120.00";
    const preview = await agent.post("/api/imports/csv/preview").send({ accountId, content });
    expect(preview.status).toBe(200);
    const rows = preview.body.rows.map(({ date, description, amount, type, categoryId, duplicate }) => ({ date, description, amount, type, categoryId, duplicate }));
    const imported = await agent.post("/api/imports/csv/commit").send({ accountId, paymentMethod: "CREDIT_CARD", creditCardId: cardId, rows });
    expect(imported.status).toBe(201);
    expect(imported.body).toMatchObject({ imported: 1, skipped: 0 });

    const account = await agent.get(`/api/accounts/${accountId}`);
    expect(account.body.account.currentBalance).toBe("2580");
    const cards = await agent.get("/api/cards");
    expect(cards.body.cards.find((cardItem) => cardItem.id === cardId)).toMatchObject({ usedLimit: "120", availableLimit: "1880" });
    const invoices = await agent.get(`/api/cards/${cardId}/invoices`);
    expect(invoices.body.invoices[0]).toMatchObject({ referenceYear: 2026, referenceMonth: 9, totalAmount: "120" });
    expect(invoices.body.invoices[0].dueDate).toContain("2026-09-20");

    const transactions = await agent.get(`/api/transactions?creditCardId=${cardId}&q=Restaurante%20Nubank&limit=10`);
    const importedPurchase = transactions.body.transactions.find((item) => item.description === "Restaurante Nubank");
    const edited = await agent.patch(`/api/transactions/${importedPurchase.id}`).send({
      accountId,
      categoryId: importedPurchase.category.id,
      type: "EXPENSE",
      description: "Restaurante atualizado",
      amount: "120.00",
      date: "2026-09-05",
      dueDate: null,
      status: "COMPLETED",
      paymentMethod: "CREDIT_CARD",
      creditCardId: cardId,
      installmentsCount: 1,
      notes: "Categoria revisada",
    });
    expect(edited.status).toBe(200);
    expect(edited.body.transaction).toMatchObject({ description: "Restaurante atualizado", amount: "120" });

    const cardAfterEdit = await agent.get("/api/cards");
    expect(cardAfterEdit.body.cards.find((cardItem) => cardItem.id === cardId)).toMatchObject({ usedLimit: "120", availableLimit: "1880" });
  });

  it("converte uma despesa importada em compra do cartão e estorna o saldo da conta", async () => {
    const transactions = await agent.get(`/api/transactions?accountId=${accountId}&q=Mercado%20Central&limit=10`);
    const importedExpense = transactions.body.transactions.find((item) => item.description === "Mercado Central");
    const converted = await agent.patch(`/api/transactions/${importedExpense.id}`).send({
      paymentMethod: "CREDIT_CARD", creditCardId: cardId, installmentsCount: 1,
    });
    expect(converted.status).toBe(200);
    expect(converted.body.transaction).toMatchObject({ paymentMethod: "CREDIT_CARD", creditCardId: cardId });
    expect(converted.body.transaction.cardPurchaseId).toBeTruthy();

    const account = await agent.get(`/api/accounts/${accountId}`);
    expect(account.body.account.currentBalance).toBe("3030");
    const cards = await agent.get("/api/cards");
    expect(cards.body.cards.find((cardItem) => cardItem.id === cardId)).toMatchObject({ usedLimit: "570", availableLimit: "1430" });
  });
});
