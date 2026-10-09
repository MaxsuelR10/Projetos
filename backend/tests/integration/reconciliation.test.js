import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
const other = request.agent(app);
const users = [];
let accountId, secondAccountId, expenseId, transferId, incomeCategory, expenseCategory;
let savedPayload;

async function transaction(data) {
  const response = await agent.post("/api/transactions").send({
    accountId, categoryId: expenseCategory, type: "EXPENSE", amount: "10",
    date: "2026-09-10", description: "Movimento auditoria", status: "COMPLETED", paymentMethod: "PIX",
    ...data,
  });
  expect(response.status).toBe(201);
  return response.body.transaction;
}
async function preview(bankBalance = "1100", target = accountId, month = "2026-09") {
  const response = await agent.get("/api/reconciliations").query({ accountId: target, month, bankBalance });
  expect(response.status).toBe(200);
  return response.body;
}
function payload(snapshot, bankBalance = snapshot.bankBalance, justification = "") {
  return { accountId: snapshot.account.id, month: snapshot.month, bankBalance,
    snapshotHash: snapshot.snapshotHash, requestId: randomUUID(), justification };
}

beforeAll(async () => {
  for (const client of [agent, other]) {
    const registration = await client.post("/api/auth/register").send({
      name: "Auditoria conciliação", email: "reconciliation-" + randomUUID() + "@example.test",
      password: "SenhaSegura123", currency: "BRL",
    });
    expect(registration.status).toBe(201);
    users.push(registration.body.user.id);
  }
  const accounts = await agent.post("/api/accounts").send({ name: "Conciliação principal", type: "CHECKING", initialBalance: "1000" });
  accountId = accounts.body.account.id;
  secondAccountId = (await agent.post("/api/accounts").send({ name: "Transferências", type: "DIGITAL", initialBalance: "500" })).body.account.id;
  const categories = (await agent.get("/api/categories")).body.categories;
  incomeCategory = categories.find((item) => item.type === "INCOME").id;
  expenseCategory = categories.find((item) => item.type === "EXPENSE").id;
  await transaction({ categoryId: incomeCategory, type: "INCOME", amount: "100", date: "2026-08-01", description: "Receita anterior" });
  const expense = await transaction({ amount: "70", date: "2026-08-20", status: "PENDING", description: "Pago em setembro" });
  expenseId = expense.id;
  expect((await agent.post("/api/transactions/" + expenseId + "/pay").send({ date: "2026-09-03" })).status).toBe(200);
  await transaction({ categoryId: incomeCategory, type: "INCOME", amount: "200", description: "Receita setembro" });
  const transfer = await agent.post("/api/transfers").send({ fromAccountId: accountId, toAccountId: secondAccountId, amount: "50", date: "2026-09-05" });
  transferId = transfer.body.transfer.id;
  expect(transfer.status).toBe(201);
  expect((await agent.post("/api/transfers").send({ fromAccountId: secondAccountId, toAccountId: accountId, amount: "25", date: "2026-09-06" })).status).toBe(201);
  const card = (await agent.post("/api/cards").send({ name: "Cartão conciliação", type: "CREDIT", creditLimit: "2000", closingDay: 15, dueDay: 20 })).body.card;
  const purchase = await agent.post("/api/cards/" + card.id + "/purchases").send({ categoryId: expenseCategory, description: "Compra na fatura", totalAmount: "120", purchaseDate: "2026-09-01", installmentsCount: 1 });
  expect(purchase.status).toBe(201);
  const invoiceId = purchase.body.purchase.installments[0].invoice.id;
  expect((await agent.post("/api/invoices/" + invoiceId + "/pay").send({ accountId, date: "2026-09-20" })).status).toBe(200);
  await transaction({ paymentMethod: "CREDIT_CARD", creditCardId: card.id, amount: "300", date: "2026-09-21", description: "Compra ainda na fatura" });
  expect((await agent.patch("/api/accounts/" + accountId + "/balance").send({ currentBalance: "1100" })).status).toBe(200);
  // Backdate only this isolated audit fixture to exercise a historical adjustment.
  await prisma.accountBalanceAdjustment.updateMany({ where: { userId: users[0], accountId }, data: { createdAt: new Date("2026-09-29T12:00:00Z") } });
  await transaction({ amount: "10", date: "2026-10-02", description: "Despesa mês seguinte" });
  await transaction({ amount: "30", date: "2026-09-15", status: "PENDING", description: "Ainda pendente" });
});

afterAll(async () => {
  for (const userId of users) {
    await prisma.$transaction([
      prisma.accountReconciliation.deleteMany({ where: { userId } }),
      prisma.transaction.deleteMany({ where: { userId } }),
      prisma.accountBalanceAdjustment.deleteMany({ where: { userId } }),
      prisma.transfer.deleteMany({ where: { userId } }),
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

describe.sequential("conciliação mensal assistida", () => {
  it("reconstrói saldos históricos, conta liquidação/transferências/ajustes e paga a fatura uma única vez", async () => {
    const snapshot = await preview();
    expect(snapshot.totals).toEqual({
      opening: "1100", closing: "1100", income: "200", expense: "70",
      transferIn: "25", transferOut: "50", invoicePayments: "120", adjustments: "15",
    });
    expect(snapshot.difference).toBe("0");
    expect(snapshot.unexplainedBalance).toBe("0");
    expect(snapshot.canReview).toBe(true);
    expect(snapshot.movements.find((item) => item.id === expenseId).date).toBe("2026-09-03");
    expect(snapshot.movements.some((item) => item.description === "Compra ainda na fatura")).toBe(false);
    expect(snapshot.movements.some((item) => item.description === "Despesa mês seguinte")).toBe(false);
    expect(snapshot.pending.map((item) => item.description)).toContain("Ainda pendente");
    expect((await agent.get("/api/accounts/" + accountId)).body.account.currentBalance).toBe("1090");
  });

  it("registra cópia auditável, aceita reenvio idempotente e exige justificativa para diferença", async () => {
    const snapshot = await preview("1110");
    const unjustified = await agent.post("/api/reconciliations").send(payload(snapshot));
    expect(unjustified.status).toBe(400);
    expect(unjustified.body.code).toBe("RECONCILIATION_JUSTIFICATION_REQUIRED");
    savedPayload = payload(await preview());
    const saved = await agent.post("/api/reconciliations").send(savedPayload);
    expect(saved.status).toBe(201);
    expect(saved.body.review).toMatchObject({ bankBalance: "1100", closingBalance: "1100", difference: "0", stale: false });
    const retry = await agent.post("/api/reconciliations").send(savedPayload);
    expect(retry.status).toBe(200);
    expect(retry.body.review.id).toBe(saved.body.review.id);
    expect((await preview()).reviews).toHaveLength(1);
    const conflict = await agent.post("/api/reconciliations").send({ ...savedPayload, bankBalance: "1101" });
    expect(conflict.status).toBe(409);
    expect((await agent.get("/api/accounts/" + accountId)).body.account.currentBalance).toBe("1090");
  });

  it("mantém a revisão de setembro ao mudar apenas movimentos posteriores", async () => {
    await transaction({ categoryId: incomeCategory, type: "INCOME", amount: "5", date: "2026-10-07", description: "Receita outubro" });
    const snapshot = await preview();
    expect(snapshot.reviews[0].stale).toBe(false);
    expect(snapshot.totals.closing).toBe("1100");
  });

  it("marca alteração relevante, rejeita prévia antiga e preserva a conferência anterior", async () => {
    const before = await preview();
    expect((await agent.patch("/api/transactions/" + expenseId).send({ amount: "80" })).status).toBe(200);
    const after = await preview();
    expect(after.totals.closing).toBe("1090");
    expect(after.reviews[0].stale).toBe(true);
    expect(after.reviews[0].snapshot.totals.closing).toBe("1100");
    expect((await agent.post("/api/reconciliations").send(payload(before))).body.code).toBe("RECONCILIATION_SNAPSHOT_CHANGED");
    const retry = await agent.post("/api/reconciliations").send(savedPayload);
    expect(retry.body.review.stale).toBe(true);
    const saved = await agent.post("/api/reconciliations").send(payload(after, "1100", "Diferença conferida no extrato de teste"));
    expect(saved.status).toBe(201);
    const history = await preview();
    expect(history.reviews).toHaveLength(2);
    expect(history.reviews[0]).toMatchObject({ stale: false, difference: "10" });
    expect(history.reviews[1].stale).toBe(true);
  });

  it("considera estornos e sinaliza possíveis duplicidades sem remover registros", async () => {
    expect((await agent.delete("/api/transfers/" + transferId)).status).toBe(200);
    const reversed = await preview();
    expect(reversed.totals.transferOut).toBe("0");
    expect(reversed.totals.closing).toBe("1140");
    expect(reversed.reviews[0].stale).toBe(true);
    const first = await transaction({ description: "DUPLICIDADE TESTE", amount: "0.10" });
    const second = await transaction({ description: "duplicidade teste", amount: "0.10" });
    const snapshot = await preview();
    expect(snapshot.movements.filter((item) => item.possibleDuplicate).map((item) => item.id)).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(snapshot.totals.closing).toBe("1139.8");
  });

  it("trata data antiga sem liquidação como estimada e exige observação", async () => {
    const transactionRecord = await transaction({ description: "Legado sem liquidação", amount: "1" });
    await prisma.transaction.update({ where: { id: transactionRecord.id }, data: { settledAt: null } });
    const snapshot = await preview("1138.8");
    expect(snapshot.legacyCount).toBe(1);
    expect(snapshot.warnings.join(" ")).toMatch(/sem data de liquidação/);
    const rejected = await agent.post("/api/reconciliations").send(payload(snapshot));
    expect(rejected.status).toBe(400);
  });

  it("bloqueia histórico que não explica saldo, meses abertos e acesso a conta de outro usuário", async () => {
    const target = (await agent.post("/api/accounts").send({ name: "Histórico incompleto", type: "CASH", initialBalance: "10" })).body.account.id;
    await prisma.account.update({ where: { id: target }, data: { currentBalance: "11" } });
    const snapshot = await preview("10", target);
    expect(snapshot).toMatchObject({ unexplainedBalance: "1", canReview: false });
    expect((await agent.post("/api/reconciliations").send(payload(snapshot))).body.code).toBe("RECONCILIATION_HISTORY_INCOMPLETE");
    const future = await preview("0", accountId, "2099-12");
    expect(future.periodEnded).toBe(false);
    expect((await agent.post("/api/reconciliations").send(payload(future))).body.code).toBe("RECONCILIATION_PERIOD_OPEN");
    expect((await other.get("/api/reconciliations").query({ accountId, month: "2026-09" })).status).toBe(404);
    expect((await other.post("/api/reconciliations").send({ ...savedPayload, requestId: randomUUID() })).status).toBe(404);
    expect((await agent.get("/api/reconciliations").query({ accountId, month: "2026-13" })).status).toBe(400);
  });

  it("permite saldo negativo e revisão de conta inativa, protegendo seu histórico", async () => {
    const target = (await agent.post("/api/accounts").send({ name: "Conta inativa negativa", type: "CHECKING", initialBalance: "-50" })).body.account.id;
    await agent.patch("/api/accounts/" + target).send({ isActive: false });
    const snapshot = await preview("-50.0000", target);
    expect(snapshot).toMatchObject({ bankBalance: "-50", difference: "0", canReview: true });
    expect((await agent.post("/api/reconciliations").send(payload(snapshot))).status).toBe(201);
    expect((await agent.delete("/api/accounts/" + target)).status).toBe(409);
    const dependencies = (await agent.get("/api/accounts/" + target + "/dependencies")).body.dependencies;
    expect(dependencies.items).toEqual(expect.arrayContaining([expect.objectContaining({ key: "reconciliations", count: 1 })]));
  });
});
