import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
const originalApiKey = env.GEMINI_API_KEY;
const originalModels = env.GEMINI_MODELS;
let userId;
let fetchMock;

function geminiResponse(parts) {
  return new Response(JSON.stringify({
    candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe.sequential("chat financeiro com Gemini", () => {
  beforeAll(async () => {
    env.GEMINI_API_KEY = "test-gemini-api-key";
    env.GEMINI_MODELS = "gemini-3.8-flash";
    fetchMock = vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      const lastContent = body.contents.at(-1);
      const functionResponse = lastContent?.parts?.find((part) => part.functionResponse)?.functionResponse;

      if (functionResponse) {
        const balance = functionResponse.response.summary.availableBalance;
        return geminiResponse([{ text: `Saldo disponível: R$ ${balance}.` }]);
      }

      const message = lastContent?.parts?.find((part) => part.text)?.text;
      if (message === "Meu nome é Max.") return geminiResponse([{ text: "Prazer, Max!" }]);
      if (message === "Qual nome eu acabei de informar?") return geminiResponse([{ text: "Você informou o nome Max." }]);
      if (message === "Qual é o meu saldo disponível?") {
        return geminiResponse([{ functionCall: { name: "get_financial_snapshot", args: { start_month: null, end_month: null } } }]);
      }
      return geminiResponse([{ text: "Olá!" }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const registration = await agent.post("/api/auth/register").send({
      name: "Teste do chat Gemini",
      email: `gemini-chat-${randomUUID()}@example.test`,
      password: "SenhaSegura123",
      currency: "BRL",
    });
    expect(registration.status).toBe(201);
    userId = registration.body.user.id;

    const account = await agent.post("/api/accounts").send({
      name: "Conta do chat",
      type: "DIGITAL",
      initialBalance: "1234.56",
    });
    expect(account.status).toBe(201);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    env.GEMINI_API_KEY = originalApiKey;
    env.GEMINI_MODELS = originalModels;
    if (userId) {
      await prisma.$transaction([
        prisma.assistantMessage.deleteMany({ where: { userId } }),
        prisma.assistantConversation.deleteMany({ where: { userId } }),
        prisma.transaction.deleteMany({ where: { userId } }),
        prisma.account.deleteMany({ where: { userId } }),
        prisma.category.deleteMany({ where: { userId } }),
        prisma.user.deleteMany({ where: { id: userId } }),
      ]);
    }
    await prisma.$disconnect();
  });

  it("responde a uma saudação simples pelo fluxo HTTP completo", async () => {
    const response = await agent.post("/api/assistant/chat").send({ message: "Olá" });

    expect(response.status).toBe(200);
    expect(response.body.reply).toBe("Olá!");
    expect(response.body.conversationId).toEqual(expect.any(String));
  });

  it("preserva o contexto entre duas mensagens e restaura o histórico", async () => {
    const first = await agent.post("/api/assistant/chat").send({ message: "Meu nome é Max." });
    expect(first.status).toBe(200);
    expect(first.body.reply).toBe("Prazer, Max!");

    const second = await agent.post("/api/assistant/chat").send({
      message: "Qual nome eu acabei de informar?",
      conversationId: first.body.conversationId,
    });
    expect(second.status).toBe(200);
    expect(second.body.reply).toBe("Você informou o nome Max.");

    const secondRequest = JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
    expect(secondRequest.contents.map((content) => content.parts[0].text)).toEqual([
      "Meu nome é Max.",
      "Prazer, Max!",
      "Qual nome eu acabei de informar?",
    ]);

    const latest = await agent.get("/api/assistant/conversations/latest");
    expect(latest.status).toBe(200);
    expect(latest.body.conversation.messages.map((message) => message.content)).toEqual([
      "Meu nome é Max.",
      "Prazer, Max!",
      "Qual nome eu acabei de informar?",
      "Você informou o nome Max.",
    ]);
  });

  it("executa ferramenta financeira com dados reais do usuário autenticado", async () => {
    const response = await agent.post("/api/assistant/chat").send({
      message: "Qual é o meu saldo disponível?",
    });

    expect(response.status).toBe(200);
    expect(response.body.reply).toBe("Saldo disponível: R$ 1234.56.");
    expect(response.body.toolsUsed).toEqual(["get_financial_snapshot"]);

    const toolResultRequest = JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
    const toolResult = toolResultRequest.contents.at(-1).parts[0].functionResponse.response;
    expect(toolResult.summary.availableBalance).toBe("1234.56");
    expect(toolResult.accounts).toEqual([
      expect.objectContaining({ name: "Conta do chat", current_balance: "1234.56" }),
    ]);
    expect(JSON.stringify(toolResult)).not.toContain("userId");
  });
});
