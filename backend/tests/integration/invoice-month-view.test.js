import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { realignUnpaidInstallments } from "../../src/services/card.service.js";
const agent = request.agent(app); let userId; let accountId; let categoryId; let cardId;
const dash = (month) => agent.get(`/api/dashboard?month=${month}&cardId=${cardId}&months=2`);
describe.sequential("fatura mensal e gráficos no corte do fechamento", () => {
  afterAll(async () => {
    if (userId) await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { userId } }), prisma.cardInstallment.deleteMany({ where: { userId } }),
      prisma.cardPurchase.deleteMany({ where: { userId } }), prisma.creditCardInvoice.deleteMany({ where: { userId } }),
      prisma.creditCard.deleteMany({ where: { userId } }), prisma.category.deleteMany({ where: { userId } }),
      prisma.account.deleteMany({ where: { userId } }), prisma.user.delete({ where: { id: userId } }),
    ]);
    await prisma.$disconnect();
  });
  it("separa compras antes, no dia e depois do fechamento em faturas diferentes", async () => {
    const registration = await agent.post("/api/auth/register").send({ name: "Auditoria fatura", email: randomUUID() + "@example.test", password: "SenhaSegura123", currency: "BRL" });
    userId = registration.body.user.id;
    accountId = (await agent.post("/api/accounts").send({ name: "Conta pagamento", type: "DIGITAL", initialBalance: "1000" })).body.account.id;
    categoryId = (await agent.get("/api/categories")).body.categories.find((item) => item.type === "EXPENSE").id;
    cardId = (await agent.post("/api/cards").send({ name: "Fecha dia 3", type: "CREDIT", closingDay: 3, dueDay: 10, creditLimit: "2000" })).body.card.id;
    for (const [date, amount] of [["2026-10-02", "10"], ["2026-10-03", "20"], ["2026-10-04", "30"]]) {
      const response = await agent.post(`/api/cards/${cardId}/purchases`).send({ description: "Compra " + date, totalAmount: amount, categoryId, purchaseDate: date, installmentsCount: 1 });
      expect(response.status).toBe(201);
    }
    const october = await agent.get(`/api/cards/${cardId}/invoices?month=2026-10`);
    expect(october.body.invoices).toHaveLength(1); expect(october.body.invoices[0].totalAmount).toBe("10");
    const november = await agent.get(`/api/cards/${cardId}/invoices?month=2026-11`);
    expect(november.body.invoices[0].totalAmount).toBe("50");
    expect(november.body.invoices[0].installments).toHaveLength(2);
    const view = await dash("2026-10");
    expect(view.body.summary).toMatchObject({ invoiceTotal: "10", pendingBills: "10" });
    expect(view.body.expenseBreakdown[0].amount).toBe("10"); expect(view.body.monthlySeries.at(-1).expense).toBe("10");
  });
  it("mantém o gráfico na competência da fatura mesmo com pagamento em outro mês", async () => {
    const invoiceId = (await agent.get(`/api/cards/${cardId}/invoices?month=2026-10`)).body.invoices[0].id;
    expect((await agent.post(`/api/invoices/${invoiceId}/pay`).send({ accountId, date: "2026-11-01", paymentMethod: "PIX" })).status).toBe(200);
    const october = (await dash("2026-10")).body;
    expect(october.summary).toMatchObject({ paidExpenses: "10", pendingBills: "0", invoiceTotal: "10" });
    expect(october.monthlySeries.at(-1).expense).toBe("10"); expect(october.expenseBreakdown[0].amount).toBe("10");
    const november = (await dash("2026-11")).body;
    expect(november.summary).toMatchObject({ paidExpenses: "0", pendingBills: "50", invoiceTotal: "50" });
    expect(november.monthlySeries.at(-1).expense).toBe("50");
    expect((await agent.get(`/api/cards/${cardId}/invoices?month=2026-10`)).body.invoices[0].status).toBe("PAID");
    const cash = (await agent.get("/api/dashboard?month=2026-11")).body;
    expect(cash.summary.paidExpenses).toBe("10"); // General cash flow remains on the payment date.
  });
  it("realinha parcelas antigas não pagas, mantendo fatura paga e saldo intactos", async () => {
    const november = (await agent.get(`/api/cards/${cardId}/invoices?month=2026-11`)).body.invoices[0];
    const october = (await agent.get(`/api/cards/${cardId}/invoices?month=2026-10`)).body.invoices[0];
    const paidBefore = await prisma.creditCardInvoice.findUnique({ where: { id: october.id } });
    const legacy = await prisma.creditCardInvoice.create({ data: { userId, creditCardId: cardId, referenceYear: 2026, referenceMonth: 9, closingDate: new Date("2026-09-03"), dueDate: new Date("2026-09-10"), totalAmount: "20" } });
    const installment = november.installments.find((item) => item.purchase.description.includes("10-03"));
    await prisma.cardInstallment.update({ where: { id: installment.id }, data: { invoiceId: legacy.id, dueDate: new Date("2026-09-10") } });
    await prisma.$transaction(async (db) => realignUnpaidInstallments(db, userId, await db.creditCard.findUnique({ where: { id: cardId } })));
    expect((await prisma.cardInstallment.findUnique({ where: { id: installment.id } })).invoiceId).toBe(november.id);
    expect(await prisma.creditCardInvoice.findUnique({ where: { id: legacy.id } })).toBeNull();
    expect(await prisma.creditCardInvoice.findUnique({ where: { id: october.id } })).toEqual(paidBefore);
    expect((await prisma.account.findUnique({ where: { id: accountId } })).currentBalance.toString()).toBe("990");
  });
});
