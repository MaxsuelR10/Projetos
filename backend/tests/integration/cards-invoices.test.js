import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const suffix = randomUUID();
const agent = request.agent(app);
let userId; let accountId; let categoryId; let cardId; let purchaseId;

async function cleanup() {
  if (!userId) return;
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.cardInstallment.deleteMany({ where: { userId } }),
    prisma.cardPurchase.deleteMany({ where: { userId } }),
    prisma.creditCardInvoice.deleteMany({ where: { userId } }),
    prisma.creditCard.deleteMany({ where: { userId } }),
    prisma.transfer.deleteMany({ where: { userId } }),
    prisma.subcategory.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

describe.sequential("cartões, parcelas e faturas", () => {
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it("prepara usuário, conta e cartão de crédito", async () => {
    const registration = await agent.post("/api/auth/register").send({ name: "Pessoa dos cartões", email: `cartoes-${suffix}@example.test`, password: "SenhaSegura123", currency: "BRL" });
    expect(registration.status).toBe(201); userId = registration.body.user.id;
    const account = await agent.post("/api/accounts").send({ name: "Conta de pagamento", type: "CHECKING", initialBalance: "1000" });
    accountId = account.body.account.id;
    const categories = await agent.get("/api/categories?type=EXPENSE&status=active");
    categoryId = categories.body.categories.find((category) => category.name === "Alimentação").id;
    const card = await agent.post("/api/cards").send({ name: "Cartão principal", institution: "Banco local", brand: "Visa", type: "CREDIT", creditLimit: "1000", closingDay: 25, dueDay: 5, color: "#1D6B4F" });
    expect(card.status).toBe(201); expect(card.body.card.availableLimit).toBe("1000"); cardId = card.body.card.id;
  });

  it("gera parcelas distribuídas em faturas e reduz o limite", async () => {
    const purchase = await agent.post(`/api/cards/${cardId}/purchases`).send({ categoryId, description: "Notebook", merchant: "Loja local", totalAmount: "120", purchaseDate: "2026-08-11", installmentsCount: 3 });
    expect(purchase.status).toBe(201); expect(purchase.body.purchase.installments).toHaveLength(3); purchaseId = purchase.body.purchase.id;
    expect(purchase.body.purchase.installments.map((item) => item.amount)).toEqual(["40", "40", "40"]);

    const cards = await agent.get("/api/cards");
    expect(cards.body.cards[0]).toMatchObject({ usedLimit: "120", availableLimit: "880" });
    const invoices = await agent.get(`/api/cards/${cardId}/invoices`);
    expect(invoices.status).toBe(200); expect(invoices.body.invoices).toHaveLength(3);
    expect(invoices.body.invoices.map((item) => `${item.referenceYear}-${item.referenceMonth}`)).toEqual(["2026-11", "2026-10", "2026-9"]);
  });

  it("paga uma fatura uma única vez, gera lançamento e baixa o saldo da conta", async () => {
    const invoices = await agent.get(`/api/cards/${cardId}/invoices`);
    const september = invoices.body.invoices.find((invoice) => invoice.referenceMonth === 9);
    const paid = await agent.post(`/api/invoices/${september.id}/pay`).send({ accountId, categoryId, date: "2026-09-05", paymentMethod: "PIX" });
    expect(paid.status).toBe(200); expect(paid.body.invoice.status).toBe("PAID");

    const account = await agent.get(`/api/accounts/${accountId}`);
    expect(account.body.account.currentBalance).toBe("960");
    const cards = await agent.get("/api/cards");
    expect(cards.body.cards[0]).toMatchObject({ usedLimit: "80", availableLimit: "920" });

    const repeated = await agent.post(`/api/invoices/${september.id}/pay`).send({ accountId, categoryId, date: "2026-09-05" });
    expect(repeated.status).toBe(409); expect(repeated.body.error.code).toBe("INVOICE_ALREADY_PAID");
  });

  it("preserva compras de fatura paga e permite cancelar compras futuras", async () => {
    const protectedPurchase = await agent.delete(`/api/card-purchases/${purchaseId}`);
    expect(protectedPurchase.status).toBe(409);
    const future = await agent.post(`/api/cards/${cardId}/purchases`).send({ categoryId, description: "Fone", totalAmount: "60", purchaseDate: "2026-08-26", installmentsCount: 1 });
    expect(future.status).toBe(201);
    const cancelled = await agent.delete(`/api/card-purchases/${future.body.purchase.id}`);
    expect(cancelled.status).toBe(204);
    const cards = await agent.get("/api/cards");
    expect(cards.body.cards[0].usedLimit).toBe("80");
  });

  it("gera doze competências e aplica o dia de fechamento para cada compra", async () => {
    const longTermCard = await agent.post("/api/cards").send({ name: "Cartão parcelado", type: "CREDIT", creditLimit: "2000", closingDay: 25, dueDay: 5 });
    expect(longTermCard.status).toBe(201);

    const installmentPurchase = await agent.post(`/api/cards/${longTermCard.body.card.id}/purchases`).send({ categoryId, description: "Compra em 12x", totalAmount: "1200.00", purchaseDate: "2026-08-25", installmentsCount: 12 });
    expect(installmentPurchase.status).toBe(201);
    expect(installmentPurchase.body.purchase.installments).toHaveLength(12);
    expect(installmentPurchase.body.purchase.installments.every((item) => item.amount === "100")).toBe(true);

    const beforeClosing = await agent.post(`/api/cards/${longTermCard.body.card.id}/purchases`).send({ categoryId, description: "Antes do fechamento", totalAmount: "10.00", purchaseDate: "2026-08-25", installmentsCount: 1 });
    const afterClosing = await agent.post(`/api/cards/${longTermCard.body.card.id}/purchases`).send({ categoryId, description: "Depois do fechamento", totalAmount: "20.00", purchaseDate: "2026-08-26", installmentsCount: 1 });
    expect(beforeClosing.status).toBe(201);
    expect(afterClosing.status).toBe(201);

    const invoices = await agent.get(`/api/cards/${longTermCard.body.card.id}/invoices`);
    expect(invoices.body.invoices).toHaveLength(12);
    const referenceFor = (description) => invoices.body.invoices.find((invoice) => invoice.installments.some((item) => item.purchase.description === description));
    expect(referenceFor("Antes do fechamento")).toMatchObject({ referenceYear: 2026, referenceMonth: 9 });
    expect(referenceFor("Depois do fechamento")).toMatchObject({ referenceYear: 2026, referenceMonth: 10 });
  });
});
