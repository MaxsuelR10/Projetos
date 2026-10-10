// Local API :3000 and Vite 127.0.0.1:5173 with VITE_API_URL=/api must be running.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { openSmokeBrowser } from "./headless-smoke-client.mjs";
assert(["localhost", "127.0.0.1"].includes(new URL(env.DATABASE_URL).hostname), "Local audit database required");
const agent = request.agent(app); let userId; let browser;
try {
  const registration = await agent.post("/api/auth/register").send({ name: "Auditoria atualização 5", email: randomUUID() + "@example.test", password: "SenhaSegura123", currency: "BRL" });
  assert.equal(registration.status, 201); userId = registration.body.user.id;
  const accountId = (await agent.post("/api/accounts").send({ name: "Conta de auditoria", type: "DIGITAL", initialBalance: "100" })).body.account.id;
  const categoryId = (await agent.get("/api/categories")).body.categories.find((item) => item.type === "EXPENSE").id;
  const cardId = (await agent.post("/api/cards").send({ name: "Cartão fecha dia 3", type: "CREDIT", creditLimit: "2000", closingDay: 3, dueDay: 10 })).body.card.id;
  for (const [date, amount] of [["2026-10-02", "10"], ["2026-10-03", "20"], ["2026-10-04", "30"]]) {
    const response = await agent.post(`/api/cards/${cardId}/purchases`).send({ categoryId, description: "Compra auditoria " + date, totalAmount: amount, purchaseDate: date, installmentsCount: 1 });
    assert.equal(response.status, 201);
  }
  browser = await openSmokeBrowser("http://127.0.0.1:5173", registration.headers["set-cookie"][0].split(";")[0]);
  await browser.navigate("/cartoes?cardId=" + cardId + "&month=2026-10");
  await browser.waitFor("document.querySelector('.invoice-card')?.textContent.includes('10,00')");
  assert.equal(await browser.evaluate("document.querySelectorAll('.invoice-card').length"), 1);
  assert.equal(await browser.evaluate("document.querySelectorAll('.movement-row').length"), 1);
  await browser.input('input[aria-label="Mês da fatura"]', "2026-11");
  await browser.waitFor("document.querySelector('.invoice-card')?.textContent.includes('50,00')");
  assert.equal(await browser.evaluate("document.querySelectorAll('.movement-row').length"), 2);
  await browser.screenshot("update5-cards-desktop.png", 1440, 1000);
  await browser.screenshot("update5-cards-mobile.png", 390, 844);
  await browser.navigate("/"); await browser.waitFor("document.querySelector('.dashboard-card-filter select')");
  await browser.input(".dashboard-card-filter select", cardId);
  await browser.waitFor("document.querySelector('.invoice-summary-link')?.textContent.includes('10,00')");
  assert(await browser.evaluate("document.querySelector('.pie-chart-center').textContent.includes('10,00')"));
  await browser.input('input[aria-label="Mês da fatura na visão geral"]', "2026-11");
  await browser.waitFor("document.querySelector('.invoice-summary-link')?.textContent.includes('50,00') && document.querySelector('.pie-chart-center')?.textContent.includes('50,00')");
  await browser.screenshot("update5-dashboard-mobile.png", 390, 844);
  await browser.click('.chart-tabs button:first-child');
  await browser.waitFor("document.querySelector('.bar-chart')");
  assert(await browser.evaluate("document.querySelector('.chart-header').textContent.includes('Faturas do cartão por mês')"));
  await browser.navigate("/importar"); await browser.waitFor("document.querySelector('input[type=file]') && !document.querySelector('input[type=file]').disabled");
  const { root } = await browser.send("DOM.getDocument");
  const { nodeId } = await browser.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
  await browser.send("DOM.setFileInputFiles", { nodeId, files: [fileURLToPath(new URL("../tests/fixtures/update5-statement.csv", import.meta.url))] });
  await browser.waitFor("document.querySelector('.csv-mapping')");
  const select = (number) => `.csv-mapping-grid label:nth-child(${number}) select`;
  await browser.input(select(3), "0"); await browser.input(select(4), "1");
  await browser.input(select(5), "DMY"); await browser.input(select(6), "COMMA");
  await browser.input(select(8), "2"); await browser.input(select(9), "3");
  await browser.input(".csv-profile-actions input", "Banco auditoria");
  await browser.click(".csv-profile-actions button.secondary-button");
  await browser.waitFor("document.querySelectorAll('.csv-mapping-grid label:first-child select option').length === 2");
  assert.equal(await prisma.transaction.count({ where: { userId } }), 0);
  await browser.screenshot("update5-mapping-desktop.png", 1440, 1000);
  await browser.screenshot("update5-mapping-mobile.png", 390, 844);
  await browser.click(".csv-mapping .primary-button");
  await browser.waitFor("document.querySelectorAll('.import-table tbody tr').length === 2");
  assert.equal(await browser.evaluate("document.querySelectorAll('.import-table tbody input[type=checkbox]:checked').length"), 2);
  await browser.input(select(5), "AUTO");
  assert.equal(await browser.evaluate("document.querySelectorAll('.import-table tbody tr').length"), 0);
  await browser.click(".csv-mapping .primary-button");
  await browser.waitFor("document.querySelectorAll('.import-table tbody tr.is-invalid').length === 2");
  assert(await browser.evaluate("document.querySelector('.import-preview button.primary-button').disabled"));
  await browser.input(select(5), "DMY"); await browser.click(".csv-mapping .primary-button");
  await browser.waitFor("document.querySelectorAll('.import-table tbody input[type=checkbox]:checked').length === 2");
  await browser.screenshot("update5-preview-mobile.png", 390, 844);
  await browser.click(".import-preview button.primary-button");
  await browser.waitFor("document.querySelector('.import-result')?.textContent.includes('2 lançamento(s)')");
  assert.equal((await prisma.account.findUnique({ where: { id: accountId } })).currentBalance.toString(), "1300.25");
  assert.equal(await prisma.transaction.count({ where: { userId } }), 2);
  assert.deepEqual(browser.errors, []);
  console.log("PASS: monthly invoice cutoff, filtered purchases, dashboard charts, CSV upload/mapping/profile, ambiguous dates, preview and confirmation; desktop/mobile.");
} finally {
  await browser?.close();
  if (userId) await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }), prisma.cardInstallment.deleteMany({ where: { userId } }),
    prisma.cardPurchase.deleteMany({ where: { userId } }), prisma.creditCardInvoice.deleteMany({ where: { userId } }),
    prisma.creditCard.deleteMany({ where: { userId } }), prisma.subcategory.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }), prisma.account.deleteMany({ where: { userId } }), prisma.user.delete({ where: { id: userId } }),
  ]);
  await prisma.$disconnect();
}
