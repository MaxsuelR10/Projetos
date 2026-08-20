import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const suffix = randomUUID();
const primaryEmail = `contas-${suffix}@example.test`;
const secondaryEmail = `isolamento-${suffix}@example.test`;
const password = "SenhaSegura123";
const primaryAgent = request.agent(app);
const secondaryAgent = request.agent(app);

let primaryUserId;
let secondaryUserId;
let primaryAccountId;
let secondaryAccountId;
let customCategoryId;
let subcategoryId;

async function register(agent, email, name) {
  const response = await agent.post("/api/auth/register").send({
    name,
    email,
    password,
    currency: "BRL",
  });

  expect(response.status).toBe(201);
  return response.body.user.id;
}

async function removeUserData(userId) {
  if (!userId) return;

  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.transfer.deleteMany({ where: { userId } }),
    prisma.accountBalanceAdjustment.deleteMany({ where: { userId } }),
    prisma.subcategory.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

describe.sequential("contas e categorias", () => {
  afterAll(async () => {
    await removeUserData(primaryUserId);
    await removeUserData(secondaryUserId);
    await prisma.$disconnect();
  });

  it("cria usuários com categorias padrão", async () => {
    primaryUserId = await register(primaryAgent, primaryEmail, "Usuário Principal");
    secondaryUserId = await register(secondaryAgent, secondaryEmail, "Usuário Secundário");

    const categories = await primaryAgent.get("/api/categories?status=all");
    expect(categories.status).toBe(200);
    expect(categories.body.categories).toHaveLength(31);
    expect(categories.body.categories[0]).not.toHaveProperty("userId");
    expect(categories.body.categories[0]).not.toHaveProperty("normalizedName");
  });

  it("cria conta, preserva o saldo inicial e impede nome duplicado", async () => {
    const response = await primaryAgent.post("/api/accounts").send({
      name: "Nubank",
      institution: "Nubank",
      type: "DIGITAL",
      initialBalance: "1250.50",
      color: "#820AD1",
      icon: "wallet",
    });

    expect(response.status).toBe(201);
    expect(response.body.account).toMatchObject({
      name: "Nubank",
      type: "DIGITAL",
      initialBalance: "1250.5",
      currentBalance: "1250.5",
    });
    expect(response.body.account).not.toHaveProperty("userId");
    primaryAccountId = response.body.account.id;

    const duplicate = await primaryAgent.post("/api/accounts").send({
      name: "nubank",
      type: "DIGITAL",
      initialBalance: "0",
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("ACCOUNT_NAME_IN_USE");
  });

  it("isola contas entre usuários e permite editar metadados", async () => {
    const secondaryAccount = await secondaryAgent.post("/api/accounts").send({
      name: "Conta privada",
      type: "CHECKING",
      initialBalance: "0",
    });
    secondaryAccountId = secondaryAccount.body.account.id;

    const inaccessible = await primaryAgent.get(`/api/accounts/${secondaryAccountId}`);
    expect(inaccessible.status).toBe(404);

    const updated = await primaryAgent.patch(`/api/accounts/${primaryAccountId}`).send({
      name: "Nubank pessoal",
      isActive: false,
    });

    expect(updated.status).toBe(200);
    expect(updated.body.account).toMatchObject({
      name: "Nubank pessoal",
      isActive: false,
      initialBalance: "1250.5",
      currentBalance: "1250.5",
    });
  });

  it("ajusta o saldo atual sem alterar o saldo inicial e mantém histórico", async () => {
    const reactivated = await primaryAgent.patch(`/api/accounts/${primaryAccountId}`).send({ isActive: true });
    expect(reactivated.status).toBe(200);
    const adjusted = await primaryAgent.patch(`/api/accounts/${primaryAccountId}/balance`).send({ currentBalance: "1500" });
    expect(adjusted.status).toBe(200);
    expect(adjusted.body.account).toMatchObject({ initialBalance: "1250.5", currentBalance: "1500" });

    const adjustment = await prisma.accountBalanceAdjustment.findFirst({ where: { accountId: primaryAccountId, userId: primaryUserId }, orderBy: { createdAt: "desc" } });
    expect(adjustment).toMatchObject({ previousBalance: expect.anything(), newBalance: expect.anything(), difference: expect.anything() });
    expect(adjustment.previousBalance.toString()).toBe("1250.5");
    expect(adjustment.newBalance.toString()).toBe("1500");
    expect(adjustment.difference.toString()).toBe("249.5");

    const dashboard = await primaryAgent.get("/api/dashboard?month=2026-08");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.summary.availableBalance).toBe("1500");

    const forbidden = await primaryAgent.patch(`/api/accounts/${secondaryAccountId}/balance`).send({ currentBalance: "1" });
    expect(forbidden.status).toBe(404);
  });

  it("cria categorias e subcategorias sem duplicidade", async () => {
    const category = await primaryAgent.post("/api/categories").send({
      name: "Casa",
      type: "EXPENSE",
      color: "#2563EB",
      icon: "home",
    });

    expect(category.status).toBe(201);
    expect(category.body.category).toMatchObject({
      name: "Casa",
      type: "EXPENSE",
      isDefault: false,
    });
    customCategoryId = category.body.category.id;

    const duplicate = await primaryAgent.post("/api/categories").send({
      name: "casa",
      type: "EXPENSE",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("CATEGORY_NAME_IN_USE");

    const subcategory = await primaryAgent
      .post(`/api/categories/${customCategoryId}/subcategories`)
      .send({ name: "Aluguel", color: "#2563EB" });

    expect(subcategory.status).toBe(201);
    expect(subcategory.body.subcategory.name).toBe("Aluguel");
    subcategoryId = subcategory.body.subcategory.id;

    const duplicateChild = await primaryAgent
      .post(`/api/categories/${customCategoryId}/subcategories`)
      .send({ name: "aluguel" });
    expect(duplicateChild.status).toBe(409);
    expect(duplicateChild.body.error.code).toBe("SUBCATEGORY_NAME_IN_USE");
  });

  it("permite desativar padrões e excluir categorias personalizadas sem vínculos", async () => {
    const categories = await primaryAgent.get("/api/categories?type=EXPENSE&status=all");
    const food = categories.body.categories.find((category) => category.name === "Alimentação");

    const deactivated = await primaryAgent.patch(`/api/categories/${food.id}`).send({
      isActive: false,
    });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.category.isActive).toBe(false);

    const protectedDeletion = await primaryAgent.delete(`/api/categories/${food.id}`);
    expect(protectedDeletion.status).toBe(409);
    expect(protectedDeletion.body.error.code).toBe("DEFAULT_CATEGORY_PROTECTED");

    const deletedChild = await primaryAgent.delete(
      `/api/categories/${customCategoryId}/subcategories/${subcategoryId}`,
    );
    expect(deletedChild.status).toBe(204);

    const deletedCategory = await primaryAgent.delete(`/api/categories/${customCategoryId}`);
    expect(deletedCategory.status).toBe(204);
  });
});
