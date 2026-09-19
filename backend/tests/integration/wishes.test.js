import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
let userId;

describe.sequential("lista de desejos e lembretes", () => {
  afterAll(async () => {
    if (userId) await prisma.$transaction([
      prisma.wishItem.deleteMany({ where: { userId } }),
      prisma.paymentReminder.deleteMany({ where: { userId } }),
      prisma.category.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);
    await prisma.$disconnect();
  });

  it("salva itens com link e lembretes de pagamento por usuário", async () => {
    const registration = await agent.post("/api/auth/register").send({ name: "Lista", email: `wishes-${randomUUID()}@example.test`, password: "SenhaSegura123", currency: "BRL" });
    expect(registration.status).toBe(201);
    userId = registration.body.user.id;

    const wish = await agent.post("/api/wishes/items").send({ name: "Notebook", amount: "4500.50", url: "https://www.example.com/notebook", notes: "Esperar promoção" });
    expect(wish.status).toBe(201);
    expect(wish.body.wish).toMatchObject({ name: "Notebook", amount: "4500.5", url: "https://www.example.com/notebook", status: "ACTIVE" });

    const reminder = await agent.post("/api/wishes/reminders").send({ title: "Pagar condomínio", dueDate: "2026-10-05", amount: "650" });
    expect(reminder.status).toBe(201);
    expect(reminder.body.reminder).toMatchObject({ title: "Pagar condomínio", dueDate: expect.stringContaining("2026-10-05"), amount: "650", isDone: false });

    const listed = await agent.get("/api/wishes");
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ wishes: [expect.objectContaining({ id: wish.body.wish.id })], reminders: [expect.objectContaining({ id: reminder.body.reminder.id })] });
  });

  it("valida links e permite concluir registros", async () => {
    expect((await agent.post("/api/wishes/items").send({ name: "Link inválido", amount: "10", url: "sem-link" })).status).toBe(400);
    const listed = await agent.get("/api/wishes");
    const wish = listed.body.wishes[0];
    const reminder = listed.body.reminders[0];
    expect((await agent.patch(`/api/wishes/items/${wish.id}`).send({ status: "PURCHASED" })).body.wish.status).toBe("PURCHASED");
    expect((await agent.patch(`/api/wishes/reminders/${reminder.id}`).send({ isDone: true })).body.reminder.isDone).toBe(true);
  });
});
