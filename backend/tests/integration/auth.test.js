import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const email = `fase1-${randomUUID()}@example.test`;
const password = "SenhaSegura123";

describe.sequential("autenticação", () => {
  afterAll(async () => {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (user) {
      await prisma.$transaction([
        prisma.category.deleteMany({ where: { userId: user.id } }),
        prisma.user.delete({ where: { id: user.id } }),
      ]);
    }

    await prisma.$disconnect();
  });

  it("cadastra usuário, cria categorias e não expõe passwordHash", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "Usuário de Teste",
      email,
      password,
      currency: "BRL",
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      name: "Usuário de Teste",
      email,
      currency: "BRL",
    });
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");

    const categories = await prisma.category.count({
      where: { userId: response.body.user.id },
    });
    expect(categories).toBe(31);
  });

  it("rejeita senha incorreta", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email,
      password: "SenhaIncorreta123",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("rejeita rota protegida sem token", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("faz login e acessa a rota protegida com cookie JWT", async () => {
    const agent = request.agent(app);
    const loginResponse = await agent.post("/api/auth/login").send({ email, password });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user).not.toHaveProperty("passwordHash");

    const meResponse = await agent.get("/api/auth/me");

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe(email);
    expect(meResponse.body.user).not.toHaveProperty("passwordHash");
  });

  it("encerra a sessão limpando o cookie", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email, password });

    const logoutResponse = await agent.post("/api/auth/logout");
    expect(logoutResponse.status).toBe(204);

    const meResponse = await agent.get("/api/auth/me");
    expect(meResponse.status).toBe(401);
  });
});
