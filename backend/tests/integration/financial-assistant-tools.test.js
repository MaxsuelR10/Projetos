import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import {
  executeFinancialTool,
  FINANCIAL_ASSISTANT_TOOLS,
} from "../../src/services/financial-assistant.service.js";

const owner = request.agent(app);
const anotherUser = request.agent(app);
let ownerId;
let anotherUserId;

async function removeUser(userId) {
  if (!userId) return;
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.cardInstallment.deleteMany({ where: { userId } }),
    prisma.cardPurchase.deleteMany({ where: { userId } }),
    prisma.creditCardInvoice.deleteMany({ where: { userId } }),
    prisma.creditCard.deleteMany({ where: { userId } }),
    prisma.budget.deleteMany({ where: { userId } }),
    prisma.financialGoal.deleteMany({ where: { userId } }),
    prisma.wishItem.deleteMany({ where: { userId } }),
    prisma.paymentReminder.deleteMany({ where: { userId } }),
    prisma.investment.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.deleteMany({ where: { id: userId } }),
  ]);
}

describe.sequential("ferramentas do assistente financeiro", () => {
  afterAll(async () => {
    await removeUser(ownerId);
    await removeUser(anotherUserId);
    await prisma.$disconnect();
  });

  it("não aceita identificador de usuário nos schemas de ferramenta", () => {
    expect(FINANCIAL_ASSISTANT_TOOLS).toHaveLength(5);
    for (const tool of FINANCIAL_ASSISTANT_TOOLS) {
      expect(Object.keys(tool.parameters.properties)).not.toContain("user_id");
      expect(Object.keys(tool.parameters.properties)).not.toContain("userId");
      expect(tool.parameters.additionalProperties).toBe(false);
    }
  });

  it("isola o resumo e a simulação por usuário autenticado", async () => {
    const [ownerRegistration, anotherRegistration] = await Promise.all([
      owner.post("/api/auth/register").send({ name: "Dono do assistente", email: `assistant-owner-${randomUUID()}@example.test`, password: "SenhaSegura123", currency: "BRL" }),
      anotherUser.post("/api/auth/register").send({ name: "Outro usuário", email: `assistant-other-${randomUUID()}@example.test`, password: "SenhaSegura123", currency: "BRL" }),
    ]);
    expect(ownerRegistration.status).toBe(201);
    expect(anotherRegistration.status).toBe(201);
    ownerId = ownerRegistration.body.user.id;
    anotherUserId = anotherRegistration.body.user.id;

    const [ownerCard, otherCard] = await Promise.all([
      owner.post("/api/cards").send({ name: "Cartão do dono", type: "CREDIT", creditLimit: "1500", closingDay: 20, dueDay: 5 }),
      anotherUser.post("/api/cards").send({ name: "Cartão de outra pessoa", type: "CREDIT", creditLimit: "9000", closingDay: 20, dueDay: 5 }),
    ]);
    expect(ownerCard.status).toBe(201);
    expect(otherCard.status).toBe(201);

    const snapshot = await executeFinancialTool(ownerId, "get_financial_snapshot", {
      start_month: null,
      end_month: null,
    });
    expect(snapshot.cards).toEqual([{ name: "Cartão do dono", used: "0", available: "1500" }]);

    const simulation = await executeFinancialTool(ownerId, "simulate_purchase_impact", {
      amount: 240,
      installments: 2,
      purchase_date: null,
      card_name: "Cartão do dono",
    });
    expect(simulation).toMatchObject({
      simulation_only: true,
      card: {
        name: "Cartão do dono",
        credit_limit: "1500",
        resulting_used_limit: "240",
        exceeds_credit_limit: false,
      },
      purchase: { installments: 2 },
    });
    expect(JSON.stringify(simulation)).not.toContain("Cartão de outra pessoa");
  });

  it("mantém o endpoint do chat protegido e valida a mensagem antes da IA", async () => {
    const anonymous = await request(app).post("/api/assistant/chat").send({ message: "Como estão minhas finanças?" });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe("UNAUTHENTICATED");

    const invalidMessage = await owner.post("/api/assistant/chat").send({ message: " " });
    expect(invalidMessage.status).toBe(400);
    expect(invalidMessage.body.code).toBe("VALIDATION_ERROR");
  });

  it("consulta desejos e lembretes somente do usuário autenticado", async () => {
    await owner.post("/api/wishes/items").send({ name: "TV para sala", amount: "2499.90", url: "https://example.com/tv" });
    await owner.post("/api/wishes/reminders").send({ title: "Pagar internet", dueDate: "2026-10-10", amount: "99.90" });
    await anotherUser.post("/api/wishes/items").send({ name: "Desejo de outro usuário", amount: "999" });

    const context = await executeFinancialTool(ownerId, "get_wishlist_items", { query: "TV" });
    expect(context).toMatchObject({
      wish_items: [{ name: "TV para sala", amount: "2499.9", url: "https://example.com/tv" }],
      pending_payment_reminders: [{ title: "Pagar internet", amount: "99.9", due_date: "2026-10-10" }],
    });
    expect(JSON.stringify(context)).not.toContain("Desejo de outro usuário");
  });
});
