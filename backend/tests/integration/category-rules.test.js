import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
const stranger = request.agent(app);
const userIds = [];
let accountId;
let secondAccountId;
let transportId;
let marketId;
let salaryId;
let savedRuleId;
let savedTransactionId;

async function preview(description, targetAccount = accountId) {
  const response = await agent.post("/api/imports/csv/preview").send({
    accountId: targetAccount,
    content: `Data;Descrição;Valor\n09/10/2026;${description};-10,00`,
  });
  expect(response.status).toBe(200);
  return response.body;
}

async function createRule(pattern, categoryId = transportId, extra = {}) {
  const response = await agent.post("/api/category-rules").send({
    pattern, categoryId, type: "EXPENSE", matchType: "CONTAINS", ...extra,
  });
  expect(response.status).toBe(201);
  return response.body.rule;
}

beforeAll(async () => {
  for (const client of [agent, stranger]) {
    const response = await client.post("/api/auth/register").send({
      name: "Auditoria regras", email: `regras-${randomUUID()}@example.test`,
      password: "SenhaSegura123", currency: "BRL",
    });
    expect(response.status).toBe(201);
    userIds.push(response.body.user.id);
  }
  const categories = (await agent.get("/api/categories")).body.categories;
  transportId = categories.find((item) => item.name === "Transporte" && item.type === "EXPENSE").id;
  marketId = categories.find((item) => item.name === "Mercado" && item.type === "EXPENSE").id;
  salaryId = categories.find((item) => item.name === "Salário").id;
  const first = await agent.post("/api/accounts").send({ name: "Banco de auditoria", type: "DIGITAL", initialBalance: "100" });
  const second = await agent.post("/api/accounts").send({ name: "Outra conta", type: "CHECKING", initialBalance: "200" });
  accountId = first.body.account.id;
  secondAccountId = second.body.account.id;
});

afterAll(async () => {
  for (const userId of userIds) {
    await prisma.$transaction([
      prisma.categoryRule.deleteMany({ where: { userId } }),
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

describe.sequential("regras pessoais de categorização", () => {
  it("salva a correção junto com o CSV e repete com segurança, sem alterar o histórico", async () => {
    const batch = await preview("LOJA PESSOAL CENTRO");
    const row = batch.rows[0];
    const payload = {
      importId: batch.importId, accountId,
      rows: [{
        importKey: row.importKey, date: row.date, description: row.description,
        type: row.type, amount: row.amount, categoryId: transportId,
        saveRule: true, ruleMatchType: "CONTAINS", rulePattern: "Loja Pessoal", ruleAccountScoped: true,
      }],
    };
    const commit = await agent.post("/api/imports/csv/commit").send(payload);
    expect(commit.status).toBe(201);
    expect(commit.body).toMatchObject({ imported: 1, rulesCreated: 1, balanceAfter: "90" });
    const retry = await agent.post("/api/imports/csv/commit").send(payload);
    expect(retry.status).toBe(201);
    expect(retry.body).toMatchObject({ imported: 0, rulesCreated: 0, duplicates: 1 });
    const rules = (await agent.get("/api/category-rules")).body.rules;
    expect(rules).toHaveLength(1);
    savedRuleId = rules[0].id;
    expect(rules[0]).toMatchObject({ source: "IMPORT", accountId, categoryId: transportId });
    expect((await preview("loja   pessoal bairro")).rows[0]).toMatchObject({
      categoryId: transportId, categorySuggestionSource: "RULE", categoryRuleId: savedRuleId,
    });
    expect((await preview("loja pessoal bairro", secondAccountId)).rows[0].categorySuggestionSource).toBe("FALLBACK");
    const movements = await agent.get(`/api/transactions?accountId=${accountId}&q=LOJA&limit=10`);
    savedTransactionId = movements.body.transactions[0].id;
    const edit = await agent.patch(`/api/category-rules/${savedRuleId}`).send({ categoryId: marketId });
    expect(edit.status).toBe(200);
    expect((await preview("loja pessoal bairro")).rows[0].categoryId).toBe(marketId);
    const stored = await prisma.transaction.findUnique({ where: { id: savedTransactionId } });
    expect(stored.categoryId).toBe(transportId);
  });

  it("prioriza correspondência exata mesmo sobre contém de uma conta e normaliza acentos", async () => {
    await createRule("CAFÉ ESPECIAL", marketId, { accountId, priority: 100 });
    const exact = await createRule("cafe especial centro", transportId, { matchType: "EXACT", priority: -100 });
    const row = (await preview("CAFÉ   ESPECIAL CENTRO")).rows[0];
    expect(row).toMatchObject({ categoryId: transportId, categoryRuleId: exact.id, categorySuggestionSource: "RULE" });
    const paused = await agent.patch(`/api/category-rules/${exact.id}`).send({ isActive: false });
    expect(paused.status).toBe(200);
    expect((await preview("CAFÉ ESPECIAL CENTRO")).rows[0].categoryId).toBe(marketId);
  });

  it("mostra conflitos na API e na prévia, e resolve apenas após ajuste explícito", async () => {
    const first = await createRule("conflito teste", marketId);
    const second = await createRule("CONFLITO TESTE", transportId);
    expect(second.conflict).toBe(true);
    const rules = (await agent.get("/api/category-rules?status=active")).body.rules;
    expect(rules.filter((rule) => [first.id, second.id].includes(rule.id)).every((rule) => rule.conflict)).toBe(true);
    const row = (await preview("conflito teste compra")).rows[0];
    expect(row.categorySuggestionSource).toBe("CONFLICT");
    expect(row.ruleConflict.ruleIds).toEqual(expect.arrayContaining([first.id, second.id]));
    const changed = await agent.patch(`/api/category-rules/${second.id}`).send({ priority: 10 });
    expect(changed.status).toBe(200);
    expect(changed.body.rule.conflict).toBe(false);
    expect((await preview("conflito teste compra")).rows[0].categoryRuleId).toBe(second.id);
    const removed = await agent.delete(`/api/category-rules/${second.id}`);
    expect(removed.status).toBe(204);
    expect((await preview("conflito teste compra")).rows[0].categoryRuleId).toBe(first.id);
  });

  it("ignora categoria inativa, permite pausar a regra inválida e evita exclusão com vínculo", async () => {
    const category = await agent.post("/api/categories").send({ name: "Categoria da regra", type: "EXPENSE" });
    const categoryId = category.body.category.id;
    const rule = await createRule("categoria invalida", categoryId);
    const deletion = await agent.delete(`/api/categories/${categoryId}`);
    expect(deletion.status).toBe(409);
    await agent.patch(`/api/categories/${categoryId}`).send({ isActive: false });
    const rules = (await agent.get("/api/category-rules")).body.rules;
    expect(rules.find((item) => item.id === rule.id).invalidReason).toMatch(/inativa/);
    expect((await preview("categoria invalida compra")).rows[0].categorySuggestionSource).toBe("FALLBACK");
    expect((await agent.patch(`/api/category-rules/${rule.id}`).send({ isActive: false })).status).toBe(200);
    expect((await agent.patch(`/api/category-rules/${rule.id}`).send({ isActive: true })).status).toBe(400);
    expect((await agent.patch(`/api/category-rules/${rule.id}`).send({ categoryId: transportId, isActive: true })).status).toBe(200);
  });

  it("isola regras por usuário, valida categoria/tipo e protege contas com regras", async () => {
    expect((await stranger.get("/api/category-rules")).body.rules).toHaveLength(0);
    expect((await stranger.patch(`/api/category-rules/${savedRuleId}`).send({ isActive: false })).status).toBe(404);
    expect((await stranger.delete(`/api/category-rules/${savedRuleId}`)).status).toBe(404);
    expect((await stranger.post("/api/category-rules").send({
      pattern: "teste", categoryId: transportId, type: "EXPENSE", matchType: "EXACT",
    })).status).toBe(404);
    expect((await agent.post("/api/category-rules").send({
      pattern: "tipo incorreto", categoryId: salaryId, type: "EXPENSE", matchType: "EXACT",
    })).status).toBe(400);
    await createRule("outra conta vinculada", marketId, { accountId: secondAccountId });
    const dependencies = await agent.get(`/api/accounts/${secondAccountId}/dependencies`);
    expect(dependencies.body.dependencies.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "categoryRules", count: 1 }),
    ]));
    expect((await agent.delete(`/api/accounts/${secondAccountId}`)).status).toBe(409);
  });

  it("faz rollback de lançamentos, regras e saldo quando uma regra contém texto inválido", async () => {
    const batch = await preview("LOTE REGRA INVALIDA");
    const row = batch.rows[0];
    const ruleCount = await prisma.categoryRule.count({ where: { userId: userIds[0] } });
    const balance = (await agent.get(`/api/accounts/${accountId}`)).body.account.currentBalance;
    const commit = await agent.post("/api/imports/csv/commit").send({
      importId: batch.importId, accountId,
      rows: [{
        importKey: row.importKey, date: row.date, description: row.description,
        type: row.type, amount: row.amount, categoryId: transportId,
        saveRule: true, rulePattern: "\u0301\u0300",
      }],
    });
    expect(commit.status).toBe(400);
    expect(await prisma.categoryRule.count({ where: { userId: userIds[0] } })).toBe(ruleCount);
    expect(await prisma.transaction.count({ where: { userId: userIds[0], importId: batch.importId } })).toBe(0);
    expect((await agent.get(`/api/accounts/${accountId}`)).body.account.currentBalance).toBe(balance);
    const missingPattern = await agent.post("/api/imports/csv/commit").send({
      importId: batch.importId, accountId,
      rows: [{ importKey: row.importKey, date: row.date, description: row.description,
        type: row.type, amount: row.amount, categoryId: transportId, saveRule: true }],
    });
    expect(missingPattern.status).toBe(400);
  });

  it("salva regra em importação no cartão sem alterar o saldo da conta", async () => {
    const card = await agent.post("/api/cards").send({
      name: "Cartão auditoria", type: "CREDIT", creditLimit: "2000", closingDay: 15, dueDay: 20,
    });
    expect(card.status).toBe(201);
    const batch = await preview("COMPRA REGRA CARTAO");
    const row = batch.rows[0];
    const balance = (await agent.get(`/api/accounts/${accountId}`)).body.account.currentBalance;
    const commit = await agent.post("/api/imports/csv/commit").send({
      importId: batch.importId, accountId, paymentMethod: "CREDIT_CARD", creditCardId: card.body.card.id,
      rows: [{
        importKey: row.importKey, date: row.date, description: row.description,
        type: row.type, amount: row.amount, categoryId: marketId,
        saveRule: true, ruleMatchType: "EXACT", rulePattern: row.description,
      }],
    });
    expect(commit.status).toBe(201);
    expect(commit.body).toMatchObject({ imported: 1, rulesCreated: 1, balanceAfter: balance });
    expect((await preview(row.description)).rows[0]).toMatchObject({
      categoryId: marketId, categorySuggestionSource: "RULE",
    });
  });
});
