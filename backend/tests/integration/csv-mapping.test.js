import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app); const other = request.agent(app);
const userIds = []; let accountId; let profileId;
const content = 'Dia contábil;Texto do banco;Saída;Entrada\n03/10/2026;Salário teste;0;1.250,50\n04/10/2026;"Loja; Centro";50,25;0';
const mapping = { delimiter: ";", dateFormat: "DMY", decimalSeparator: "COMMA", amountMode: "SPLIT", date: 0, description: 1, debit: 2, credit: 3, amount: null };
const preview = (options = {}) => agent.post("/api/imports/csv/preview").send({ accountId, content, mapping, ...options });
describe.sequential("mapeamento assistido de CSV", () => {
  beforeAll(async () => {
    for (const [index, client] of [agent, other].entries()) {
      const registration = await client.post("/api/auth/register").send({ name: "Auditoria CSV " + index, email: randomUUID() + "@example.test", password: "SenhaSegura123", currency: "BRL" });
      expect(registration.status).toBe(201); userIds.push(registration.body.user.id);
    }
    const account = await agent.post("/api/accounts").send({ name: "Conta CSV", type: "DIGITAL", initialBalance: "100" });
    expect(account.status).toBe(201); accountId = account.body.account.id;
  });
  afterAll(async () => {
    for (const userId of userIds) await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { userId } }), prisma.subcategory.deleteMany({ where: { userId } }),
      prisma.category.deleteMany({ where: { userId } }), prisma.account.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);
    await prisma.$disconnect();
  });
  it("inspeciona cabeçalhos desconhecidos, aspas e amostra sem criar movimentos", async () => {
    const response = await agent.post("/api/imports/csv/inspect").send({ accountId, content });
    expect(response.status).toBe(200); expect(response.body.headers).toHaveLength(4);
    expect(response.body.samples[1][1]).toBe("Loja; Centro"); expect(response.body.rowCount).toBe(2);
    expect(await prisma.transaction.count({ where: { userId: userIds[0] } })).toBe(0);
    expect((await prisma.account.findUnique({ where: { id: accountId } })).currentBalance.toString()).toBe("100");
    expect((await other.post("/api/imports/csv/inspect").send({ accountId, content })).status).toBe(404);
  });
  it("mapeia débitos/créditos com zero na coluna oposta e calcula a prévia", async () => {
    const response = await preview(); expect(response.status).toBe(200);
    expect(response.body.rows[0]).toMatchObject({ valid: true, date: "2026-10-03", amount: "1250.50", type: "INCOME" });
    expect(response.body.rows[1]).toMatchObject({ valid: true, description: "Loja; Centro", amount: "50.25", type: "EXPENSE" });
    expect(response.body.summary.projectedBalance).toBe("1300.25");
    expect(await prisma.transaction.count({ where: { userId: userIds[0] } })).toBe(0);
  });
  it("exige escolha para datas/valores ambíguos e mantém linhas inválidas visíveis", async () => {
    const response = await preview({ content: "Dia;Texto;Valor\n03/04/2026;Compra teste;-1.234", mapping: { ...mapping, amountMode: "SIGNED", amount: 2, debit: null, credit: null, dateFormat: "AUTO", decimalSeparator: "AUTO" } });
    expect(response.body.rows[0]).toMatchObject({ valid: false, date: "", amount: "" });
    expect(response.body.rows[0].issues.join(" ")).toContain("ambígu");
    const fixed = await preview({ content: "Dia;Texto;Valor\n03/04/2026;Compra teste;-1.234", mapping: { ...mapping, amountMode: "SIGNED", amount: 2, debit: null, credit: null, dateFormat: "MDY" } });
    expect(fixed.body.rows[0]).toMatchObject({ valid: true, date: "2026-03-04", amount: "1234.00", type: "EXPENSE" });
  });
  it("não escolhe silenciosamente um lado quando débito e crédito têm valores", async () => {
    const response = await preview({ content: "Dia;Texto;Débito;Crédito\n03/10/2026;Ambos;10,00;20,00" });
    expect(response.body.rows[0].valid).toBe(false); expect(response.body.rows[0].issues.join(" ")).toContain("mesma linha");
    expect((await preview({ mapping: { ...mapping, description: 0 } })).status).toBe(400);
    expect((await preview({ mapping: { ...mapping, description: 99 } })).status).toBe(400);
    expect((await agent.post("/api/imports/csv/inspect").send({ accountId, content: 'a;b;c\n"não fecha' })).status).toBe(400);
  });
  it("salva somente formato/cabeçalhos, isola o perfil e detecta mudanças no arquivo", async () => {
    const response = await agent.post("/api/imports/profiles").send({ name: "Banco de teste", headers: ["Dia contábil", "Texto do banco", "Saída", "Entrada"], mapping });
    expect(response.status).toBe(201); profileId = response.body.id;
    const saved = await prisma.csvImportProfile.findUnique({ where: { id: profileId } }); expect(saved).not.toHaveProperty("content");
    expect((await other.get("/api/imports/profiles")).body.profiles).toEqual([]);
    expect((await other.post("/api/imports/csv/preview").send({ accountId, content, profileId })).status).toBe(404);
    expect((await other.delete("/api/imports/profiles/" + profileId)).status).toBe(404);
    expect((await agent.post("/api/imports/csv/preview").send({ accountId, content, profileId })).body.rows[0].valid).toBe(true);
    expect((await agent.post("/api/imports/csv/preview").send({ accountId, content: content.replace("Saída", "Novo nome"), profileId })).status).toBe(409);
  });
  it("confirma linhas mapeadas uma vez e permite reutilizar/excluir o perfil", async () => {
    const response = await preview();
    const rows = response.body.rows.map(({ importKey, date, description, amount, type, categoryId }) => ({ importKey, date, description, amount, type, categoryId }));
    const payload = { accountId, importId: response.body.importId, rows };
    expect((await agent.post("/api/imports/csv/commit").send(payload)).body.imported).toBe(2);
    expect((await agent.post("/api/imports/csv/commit").send(payload)).body.imported).toBe(0);
    expect((await prisma.account.findUnique({ where: { id: accountId } })).currentBalance.toString()).toBe("1300.25");
    expect((await preview()).body.rows.every((row) => row.duplicate)).toBe(true);
    expect((await agent.delete("/api/imports/profiles/" + profileId)).status).toBe(204);
  });
});
