import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const owner = request.agent(app);
const otherUser = request.agent(app);
let ownerId;
let otherUserId;
let accountId;
let expenseCategoryId;
let incomeCategoryId;

async function cleanUser(userId) {
  if (!userId) return;
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

describe.sequential("listagem de movimentações", () => {
  afterAll(async () => {
    await cleanUser(ownerId);
    await cleanUser(otherUserId);
    await prisma.$disconnect();
  });

  it("filtra, pesquisa e ordena somente lançamentos do usuário autenticado", async () => {
    const registration = await owner.post("/api/auth/register").send({
      name: "Listagem proprietária",
      email: `list-owner-${randomUUID()}@example.test`,
      password: "SenhaSegura123",
      currency: "BRL",
    });
    expect(registration.status).toBe(201);
    ownerId = registration.body.user.id;

    const account = await owner.post("/api/accounts").send({ name: "Conta de filtros", type: "DIGITAL", initialBalance: "1000" });
    expect(account.status).toBe(201);
    accountId = account.body.account.id;
    const categories = await owner.get("/api/categories?status=active");
    expenseCategoryId = categories.body.categories.find((category) => category.type === "EXPENSE").id;
    incomeCategoryId = categories.body.categories.find((category) => category.type === "INCOME").id;

    await owner.post("/api/transactions").send({ accountId, categoryId: expenseCategoryId, type: "EXPENSE", description: "Mercado Central", amount: "120", date: "2026-09-02", status: "PENDING", paymentMethod: "PIX", notes: "Compra mensal" });
    await owner.post("/api/transactions").send({ accountId, categoryId: expenseCategoryId, type: "EXPENSE", description: "Internet", amount: "99", date: "2026-09-01", status: "COMPLETED", paymentMethod: "BOLETO" });
    await owner.post("/api/transactions").send({ accountId, categoryId: incomeCategoryId, type: "INCOME", description: "Salário", amount: "2000", date: "2026-09-01", status: "COMPLETED", paymentMethod: "PIX" });

    const filtered = await owner.get("/api/transactions?state=OPEN&q=mensal&sort=DESCRIPTION_ASC");
    expect(filtered.status).toBe(200);
    expect(filtered.body.pagination).toMatchObject({ page: 1, total: 1 });
    expect(filtered.body.transactions).toHaveLength(1);
    expect(filtered.body.transactions[0]).toMatchObject({ description: "Mercado Central", status: "PENDING" });

    const otherRegistration = await otherUser.post("/api/auth/register").send({
      name: "Outro usuário",
      email: `list-other-${randomUUID()}@example.test`,
      password: "SenhaSegura123",
      currency: "BRL",
    });
    otherUserId = otherRegistration.body.user.id;
    const isolated = await otherUser.get(`/api/transactions?accountId=${accountId}&q=Mercado`);
    expect(isolated.status).toBe(200);
    expect(isolated.body.transactions).toHaveLength(0);
  });
});
