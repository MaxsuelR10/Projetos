import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
const email = `importacao-${randomUUID()}@example.test`;
let userId;
let accountId;

afterAll(async () => {
  if (userId) {
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { userId } }),
      prisma.subcategory.deleteMany({ where: { userId } }),
      prisma.category.deleteMany({ where: { userId } }),
      prisma.account.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);
  }
  await prisma.$disconnect();
});

describe.sequential("importação de extrato CSV", () => {
  it("lê, categoriza e não duplica lançamentos já importados", async () => {
    const registration = await agent.post("/api/auth/register").send({
      name: "Usuário de importação", email, password: "SenhaSegura123", currency: "BRL",
    });
    expect(registration.status).toBe(201);
    userId = registration.body.user.id;

    const account = await agent.post("/api/accounts").send({ name: "Nubank", type: "DIGITAL", initialBalance: "0" });
    expect(account.status).toBe(201);
    accountId = account.body.account.id;

    const content = "Data;Descrição;Valor\n05/09/2026;Mercado Central;-123,45\n06/09/2026;Pagamento salário;2500,00";
    const preview = await agent.post("/api/imports/csv/preview").send({ accountId, content });
    expect(preview.status).toBe(200);
    expect(preview.body.rows).toHaveLength(2);
    expect(preview.body.rows[0]).toMatchObject({ type: "EXPENSE", amount: "123.45", categoryName: "Mercado", duplicate: false });
    expect(preview.body.rows[1]).toMatchObject({ type: "INCOME", amount: "2500.00", categoryName: "Salário", duplicate: false });

    const rows = preview.body.rows.map(({ date, description, amount, type, categoryId, duplicate }) => ({ date, description, amount, type, categoryId, duplicate }));
    const imported = await agent.post("/api/imports/csv/commit").send({ accountId, rows });
    expect(imported.status).toBe(201);
    expect(imported.body).toMatchObject({ imported: 2, skipped: 0 });

    const duplicatePreview = await agent.post("/api/imports/csv/preview").send({ accountId, content });
    expect(duplicatePreview.status).toBe(200);
    expect(duplicatePreview.body.rows.every((row) => row.duplicate)).toBe(true);

    const storedAccount = await agent.get(`/api/accounts/${accountId}`);
    expect(storedAccount.body.account.currentBalance).toBe("2376.55");
  });
});
