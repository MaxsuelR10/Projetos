// Requires the local API on localhost:3000 and Vite at 127.0.0.1:5173 (VITE_API_URL=/api).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { openSmokeBrowser } from "./headless-smoke-client.mjs";

assert(["localhost", "127.0.0.1"].includes(new URL(env.DATABASE_URL).hostname), "Use a local audit database");
const agent = request.agent(app);
let userId;
let browser;
try {
  const registration = await agent.post("/api/auth/register").send({
    name: "Auditoria visual conciliação", email: "reconciliation-visual-" + randomUUID() + "@example.test",
    password: "SenhaSegura123", currency: "BRL",
  });
  assert.equal(registration.status, 201);
  userId = registration.body.user.id;
  const accountId = (await agent.post("/api/accounts").send({ name: "Conta de conferência", type: "DIGITAL", initialBalance: "100" })).body.account.id;
  const categories = (await agent.get("/api/categories")).body.categories;
  const categoryId = categories.find((item) => item.type === "EXPENSE").id;
  const transaction = async (description, amount, status = "COMPLETED") => {
    const response = await agent.post("/api/transactions").send({ accountId, categoryId, description, amount, status, date: "2026-09-15", type: "EXPENSE", paymentMethod: "PIX" });
    assert.equal(response.status, 201);
    return response.body.transaction;
  };
  const expense = await transaction("Despesa principal auditoria", "10");
  await transaction("Possível duplicidade auditoria", "1");
  await transaction("Possível duplicidade auditoria", "1");
  await transaction("Lançamento ainda pendente", "5", "PENDING");
  const cookie = registration.headers["set-cookie"][0].split(";")[0];
  browser = await openSmokeBrowser("http://127.0.0.1:5173", cookie);
  await browser.navigate("/conciliacao");
  await browser.waitFor("document.querySelector('.reconciliation-metrics')");
  await browser.input('input[type="month"]', "2026-09");
  await browser.input('.reconciliation-comparison input', "88,00");
  await browser.waitFor("document.querySelector('.reconciliation-difference').textContent.includes('Os saldos conferem')");
  await browser.click('.reconciliation-metrics button:nth-child(3)');
  assert.equal(await browser.evaluate("document.querySelectorAll('.reconciliation-event').length"), 3);
  await browser.click('.reconciliation-search input[type="checkbox"]');
  assert.equal(await browser.evaluate("document.querySelectorAll('.reconciliation-event').length"), 2);
  await browser.click('.reconciliation-search input[type="checkbox"]');
  await browser.input('.reconciliation-search input:not([type="checkbox"])', "principal");
  await browser.click(".reconciliation-event");
  await browser.waitFor("document.querySelector('.reconciliation-detail')");
  await browser.screenshot("reconciliation-desktop.png", 1440, 1000);
  await browser.screenshot("reconciliation-mobile.png", 390, 844);
  await browser.click('.reconciliation-comparison button[type="submit"]');
  await browser.waitFor("document.querySelectorAll('.reconciliation-history details').length === 1");
  assert.equal(await prisma.accountReconciliation.count({ where: { userId } }), 1);
  assert.equal((await agent.get("/api/accounts/" + accountId)).body.account.currentBalance, "88");
  const rename = await agent.patch("/api/transactions/" + expense.id).send({ description: "Despesa principal auditoria revisada" });
  assert.equal(rename.status, 200);
  await browser.click(".reconciliation-controls button");
  await browser.waitFor("document.querySelector('.reconciliation-status')?.textContent.includes('mudaram desde')");
  await browser.click('.reconciliation-comparison button[type="submit"]');
  await browser.waitFor("document.querySelectorAll('.reconciliation-history details').length === 2");
  assert.equal(await prisma.accountReconciliation.count({ where: { userId } }), 2);
  const edit = await agent.patch("/api/transactions/" + expense.id).send({ amount: "20" });
  assert.equal(edit.status, 200);
  await browser.click(".reconciliation-controls button");
  await browser.waitFor("document.querySelector('.reconciliation-status')?.textContent.includes('mudaram desde')");
  assert.equal(await browser.evaluate("document.querySelector('.reconciliation-comparison button[type=\"submit\"]').disabled"), true);
  await browser.input(".reconciliation-comparison textarea", "Diferença conferida com o extrato de auditoria.");
  await browser.waitFor("!document.querySelector('.reconciliation-comparison button[type=\"submit\"]').disabled");
  await browser.click('.reconciliation-comparison button[type="submit"]');
  await browser.waitFor("document.querySelectorAll('.reconciliation-history details').length === 3");
  await browser.screenshot("reconciliation-reviewed-mobile.png", 390, 844);
  assert.equal((await agent.get("/api/accounts/" + accountId)).body.account.currentBalance, "78");
  await browser.click(".reconciliation-detail a");
  await browser.waitFor("document.querySelector('input[aria-label=\"Buscar movimentação\"]')?.value === 'Despesa principal auditoria revisada'");
  assert(await browser.evaluate("location.search.includes('accountId=')"));
  assert.deepEqual(browser.errors, []);
  console.log("PASS: balances, clickable totals, duplicates, detail links, saved review, stale review, justified difference, desktop/mobile.");
} finally {
  await browser?.close();
  if (userId) await prisma.$transaction([
    prisma.accountReconciliation.deleteMany({ where: { userId } }),
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.subcategory.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
  await prisma.$disconnect();
}
