import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
let userId;
let accountId;
let categoryId;
let cardId;

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

describe.sequential("despesa com cartao pela tela de lancamentos", () => {
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it("vincula compra, fatura e limite sem debitar a conta", async () => {
    const registration = await agent.post("/api/auth/register").send({ name: "Fluxo cartao", email: `cartao-movimento-${randomUUID()}@example.test`, password: "SenhaSegura123", currency: "BRL" });
    expect(registration.status).toBe(201); userId = registration.body.user.id;
    const account = await agent.post("/api/accounts").send({ name: "Conta principal", type: "DIGITAL", initialBalance: "1000" });
    accountId = account.body.account.id;
    const categories = await agent.get("/api/categories?type=EXPENSE&status=active");
    categoryId = categories.body.categories.find((item) => item.name === "Alimentação").id;
    const card = await agent.post("/api/cards").send({ name: "Cartao principal", type: "CREDIT", creditLimit: "500", closingDay: 20, dueDay: 27 });
    expect(card.status).toBe(201); cardId = card.body.card.id;

    const missingCard = await agent.post("/api/transactions").send({ accountId, categoryId, type: "EXPENSE", description: "Sem cartao", amount: "10", date: "2026-08-11", paymentMethod: "CREDIT_CARD" });
    expect(missingCard.status).toBe(400);

    const created = await agent.post("/api/transactions").send({ accountId, categoryId, type: "EXPENSE", description: "Compra no cartao", amount: "120", date: "2026-08-11", paymentMethod: "CREDIT_CARD", creditCardId: cardId });
    expect(created.status).toBe(201);
    expect(created.body.transaction.creditCard.id).toBe(cardId);

    const currentAccount = await agent.get(`/api/accounts/${accountId}`);
    expect(currentAccount.body.account.currentBalance).toBe("1000");
    const cards = await agent.get("/api/cards");
    expect(cards.body.cards.find((item) => item.id === cardId)).toMatchObject({ usedLimit: "120", availableLimit: "380" });
    const invoices = await agent.get(`/api/cards/${cardId}/invoices`);
    expect(invoices.body.invoices).toHaveLength(1);
    expect(invoices.body.invoices[0].totalAmount).toBe("120");
  });
});
