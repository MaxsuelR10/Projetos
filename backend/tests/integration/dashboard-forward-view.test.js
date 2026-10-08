import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
const today = new Date().toISOString().slice(0, 10);
const [year, month] = today.split("-").map(Number);
let userId;

async function cleanup() {
  if (!userId) return;
  await prisma.$transaction([
    prisma.paymentReminder.deleteMany({ where: { userId } }),
    prisma.budget.deleteMany({ where: { userId } }),
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

describe.sequential("visão futura do dashboard", () => {
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("separa saldo, compromissos, agenda, alertas e onboarding", async () => {
    const registration = await agent.post("/api/auth/register").send({
      name: "Agenda financeira",
      email: `agenda-${randomUUID()}@example.test`,
      password: "SenhaSegura123",
      currency: "BRL",
    });
    expect(registration.status).toBe(201);
    userId = registration.body.user.id;

    const account = await agent.post("/api/accounts").send({
      name: "Conta agenda",
      type: "DIGITAL",
      initialBalance: "1000",
    });
    const categories = await agent.get("/api/categories?type=EXPENSE&status=active");
    const categoryId = categories.body.categories.find((item) => item.name === "Alimentação").id;

    const pending = await agent.post("/api/transactions").send({
      accountId: account.body.account.id,
      categoryId,
      type: "EXPENSE",
      description: "Conta da agenda",
      amount: "100",
      date: today,
      dueDate: today,
      status: "PENDING",
      paymentMethod: "PIX",
    });
    expect(pending.status).toBe(201);

    await prisma.paymentReminder.create({
      data: { userId, title: "Lembrar pagamento", dueDate: new Date(`${today}T00:00:00.000Z`), amount: "25" },
    });
    await prisma.budget.create({
      data: { userId, categoryId, year, month, limitAmount: "100" },
    });

    const response = await agent.get(`/api/dashboard?month=${today.slice(0, 7)}`);
    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({
      currentBalance: "1000",
      paidExpenses: "0",
      futureCommitments: "100",
      freeBalanceProjected: "900",
    });
    expect(response.body.agenda.items.map((item) => item.type)).toEqual(
      expect.arrayContaining(["TRANSACTION", "REMINDER", "BUDGET"]),
    );
    expect(response.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "BUDGET", severity: "danger" }),
      ]),
    );
    expect(response.body.onboarding).toMatchObject({
      hasAccount: true,
      hasInitialBalance: true,
      hasMovement: true,
      hasCard: false,
    });
  });
});
