// Requires local Vite on 127.0.0.1:5173 with VITE_API_URL=/api.
// Exercises an isolated audit user and a fresh headless Chrome profile.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/config/database.js";
import { env } from "../src/config/env.js";

assert(["localhost", "127.0.0.1"].includes(new URL(env.DATABASE_URL).hostname), "Use a local audit database");
const origin = "http://127.0.0.1:5173";
const agent = request.agent(app);
const folder = await mkdtemp(join(tmpdir(), "category-rules-smoke-"));
const server = app.listen(3000);
let userId;
let browser;
let socket;
let commandId = 0;
const pending = new Map();
const errors = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function send(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 12000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(expression)) return;
    await pause(150);
  }
  throw new Error("UI timeout: " + expression);
}
async function input(selector, value) {
  await evaluate("(() => { const el = document.querySelector(" + JSON.stringify(selector) + ");"
    + "if (!el) throw new Error('Missing input');"
    + "const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;"
    + "Object.getOwnPropertyDescriptor(proto, 'value').set.call(el," + JSON.stringify(value) + ");"
    + "el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()");
}
async function click(selector) {
  await evaluate("document.querySelector(" + JSON.stringify(selector) + ").click()");
}
async function clickButton(text, root = "document") {
  await evaluate("Array.from(" + root + ".querySelectorAll('button')).find(el => el.textContent.trim() === " + JSON.stringify(text) + ").click()");
}
async function upload(name, description) {
  const file = join(folder, name);
  await writeFile(file, "Data;Descrição;Valor\n09/10/2026;" + description + ";-10,00\n");
  const { root } = await send("DOM.getDocument");
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
  await send("DOM.setFileInputFiles", { nodeId, files: [file] });
  await waitFor("document.querySelector('.import-table input[aria-label=\"Descrição\"]')?.value === " + JSON.stringify(description));
}
async function screenshot(name, width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
  await pause(150);
  assert(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Page overflows horizontally");
  const { cssContentSize } = await send("Page.getLayoutMetrics");
  const shot = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height: cssContentSize.height, scale: 1 },
  });
  const path = join(folder, name);
  await writeFile(path, Buffer.from(shot.data, "base64"));
  console.log("Screenshot: " + path);
}

try {
  const registration = await agent.post("/api/auth/register").send({
    name: "Auditoria visual regras", email: "visual-rules-" + randomUUID() + "@example.test",
    password: "SenhaSegura123", currency: "BRL",
  });
  assert.equal(registration.status, 201);
  userId = registration.body.user.id;
  const account = await agent.post("/api/accounts").send({ name: "Conta visual auditoria", type: "DIGITAL", initialBalance: "100" });
  const accountId = account.body.account.id;
  const categories = (await agent.get("/api/categories")).body.categories;
  const marketId = categories.find((item) => item.name === "Mercado" && item.type === "EXPENSE").id;
  const transportId = categories.find((item) => item.name === "Transporte" && item.type === "EXPENSE").id;
  browser = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=9333", "--user-data-dir=" + join(folder, "profile"), "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  let tabs;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { tabs = await (await fetch("http://127.0.0.1:9333/json")).json(); break; } catch { await pause(150); }
  }
  assert(tabs, "Chrome did not start");
  socket = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id) {
      const command = pending.get(data.id);
      if (!command) return;
      clearTimeout(command.timer);
      pending.delete(data.id);
      if (data.error) command.reject(new Error(data.error.message)); else command.resolve(data.result);
    }
    if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails.text);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  const cookie = registration.headers["set-cookie"][0].split(";")[0];
  const separator = cookie.indexOf("=");
  await send("Network.setCookie", { name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: origin, httpOnly: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: origin + "/regras-categorias" });
  await waitFor("document.querySelector('.rule-form') && document.querySelectorAll('.rule-form option').length > 15");
  await input(".rule-form input", "auditoria manual");
  await input(".rule-form label:nth-child(4) select", marketId);
  await clickButton("Criar regra");
  await waitFor("document.querySelectorAll('.rule-card').length === 1");
  await clickButton("Pausar", "document.querySelector('.rule-card')");
  await waitFor("document.querySelector('.rule-card .status-pill').textContent === 'Pausada'");
  await clickButton("Ativar", "document.querySelector('.rule-card')");
  await waitFor("document.querySelector('.rule-card .status-pill').textContent === 'Ativa'");
  await clickButton("Editar", "document.querySelector('.rule-card')");
  await input(".rule-form input", "auditoria manual editada");
  await clickButton("Salvar alterações");
  await waitFor("document.querySelector('.rule-card-title').textContent.includes('editada')");
  await screenshot("rules-desktop.png", 1440, 1000);
  await screenshot("rules-mobile.png", 390, 844);
  await send("Page.navigate", { url: origin + "/importar" });
  await waitFor("document.querySelector('input[type=\"file\"]') && !document.querySelector('input[type=\"file\"]').disabled");
  await upload("first.csv", "AUDITORIA NOVA LOJA");
  await input(".category-rule-cell > select", marketId);
  await click(".rule-save-toggle input");
  await input('.rule-inline-options input[aria-label="Texto da nova regra"]', "AUDITORIA NOVA");
  await input(".rule-inline-options select", "CONTAINS");
  await screenshot("import-learning-mobile.png", 390, 844);
  await clickButton("Confirmar 1 lançamento(s)");
  await waitFor("document.querySelector('.import-result')?.textContent.includes('regra(s) criada(s)')");
  const saved = (await agent.get("/api/category-rules")).body.rules.find((rule) => rule.source === "IMPORT");
  assert.equal(saved.categoryId, marketId);
  assert.equal(saved.accountId, accountId);
  await upload("next.csv", "AUDITORIA NOVA FILIAL");
  await waitFor("document.querySelector('.category-suggestion')?.textContent.includes('Regra pessoal')");
  assert.equal(await evaluate("document.querySelector('.category-rule-cell > select').value"), marketId);
  await agent.post("/api/category-rules").send({
    pattern: "AUDITORIA NOVA", categoryId: transportId, accountId, type: "EXPENSE", matchType: "CONTAINS",
  });
  await upload("conflict.csv", "AUDITORIA NOVA FILIAL CONFLITO");
  assert.equal(await evaluate("document.querySelector('.import-table tbody input[type=\"checkbox\"]').disabled"), true);
  assert.equal(await evaluate("document.querySelector('.import-table tbody input[type=\"checkbox\"]').checked"), false);
  await screenshot("import-conflict-desktop.png", 1440, 1000);
  await click(".category-rule-cell .rule-save-toggle input");
  assert.equal(await evaluate("document.querySelector('.import-table tbody input[type=\"checkbox\"]').disabled"), false);
  assert.equal(await evaluate("document.querySelector('.import-table tbody input[type=\"checkbox\"]').checked"), false);
  assert.deepEqual(errors, []);
  console.log("PASS: create, pause, activate, edit, CSV learning, reuse, explicit conflict review, desktop/mobile layout.");
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await send("Browser.close"); } catch { browser?.kill(); }
    socket.close();
  } else browser?.kill();
  if (userId) {
    await prisma.$transaction([
      prisma.categoryRule.deleteMany({ where: { userId } }),
      prisma.transaction.deleteMany({ where: { userId } }),
      prisma.subcategory.deleteMany({ where: { userId } }),
      prisma.category.deleteMany({ where: { userId } }),
      prisma.account.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);
  }
  await prisma.$disconnect();
  await new Promise((resolve) => server.close(resolve));
}
