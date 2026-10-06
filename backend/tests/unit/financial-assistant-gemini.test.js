import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleGenAI } from "@google/genai";
import { env } from "../../src/config/env.js";
import {
  answerFinancialQuestion,
  callGemini,
} from "../../src/services/financial-assistant.service.js";

const originalModels = env.GEMINI_MODELS;
const originalModel = env.GEMINI_MODEL;
const originalApiKey = env.GEMINI_API_KEY;

afterEach(() => {
  env.GEMINI_MODELS = originalModels;
  env.GEMINI_MODEL = originalModel;
  env.GEMINI_API_KEY = originalApiKey;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("transporte Gemini do assistente financeiro", () => {
  it("é serializado pelo SDK no formato aceito pela API Gemini", async () => {
    env.GEMINI_MODELS = "gemini-3.8-flash";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: "Olá!" }] }, finishReason: "STOP" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callGemini({
      conversationItems: [{ role: "user", parts: [{ text: "Olá" }] }],
      currency: "BRL",
      signal: new AbortController().signal,
      client: new GoogleGenAI({ apiKey: "test-gemini-api-key" }),
    });

    expect(response.text).toBe("Olá!");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(String(url)).toContain("models/gemini-3.8-flash:generateContent");
    expect(body.systemInstruction.parts[0].text).toContain("Use a moeda cadastrada (BRL)");
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "Olá" }] }]);
    expect(body.tools[0].functionDeclarations[0].parametersJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(JSON.stringify(body)).not.toContain("test-gemini-api-key");
  });

  it("usa o SDK oficial, envia schemas JSON e troca de modelo após 404", async () => {
    env.GEMINI_MODELS = "gemini-3.8-flash,gemini-3.5-flash-lite";
    env.GEMINI_MODEL = undefined;
    const providerResponse = { candidates: [{ content: { parts: [{ text: "Olá!" }] } }] };
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error(JSON.stringify({ error: { status: "NOT_FOUND", message: "model unavailable" } })), { status: 404 }))
      .mockResolvedValueOnce(providerResponse);
    const controller = new AbortController();

    const result = await callGemini({
      conversationItems: [{ role: "user", parts: [{ text: "Olá" }] }],
      currency: "BRL",
      signal: controller.signal,
      client: { models: { generateContent } },
    });

    expect(result).toBe(providerResponse);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual([
      "gemini-3.8-flash",
      "gemini-3.5-flash-lite",
    ]);
    const request = generateContent.mock.calls[0][0];
    expect(request.contents).toEqual([{ role: "user", parts: [{ text: "Olá" }] }]);
    expect(request.config.systemInstruction).toContain("Use a moeda cadastrada (BRL)");
    expect(request.config.abortSignal).toBe(controller.signal);
    expect(request.config.httpOptions.retryOptions.attempts).toBe(2);
    expect(request.config.tools[0].functionDeclarations).toHaveLength(9);
    expect(request.config.tools[0].functionDeclarations[0].parametersJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(JSON.stringify(request)).not.toContain("GEMINI_API_KEY");
  });

  it("não troca de modelo depois de 429 e preserva diagnóstico seguro", async () => {
    env.GEMINI_MODELS = "gemini-3.8-flash,gemini-3.5-flash-lite";
    const generateContent = vi.fn().mockRejectedValue(
      Object.assign(new Error(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "quota exceeded" } })), { status: 429 }),
    );

    await expect(callGemini({
      conversationItems: [{ role: "user", parts: [{ text: "Olá" }] }],
      currency: "BRL",
      signal: new AbortController().signal,
      client: { models: { generateContent } },
    })).rejects.toMatchObject({
      status: 429,
      code: "RESOURCE_EXHAUSTED",
      model: "gemini-3.8-flash",
      providerMessage: "quota exceeded",
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("falha antes de consultar banco ou provedor quando a chave está ausente", async () => {
    env.GEMINI_API_KEY = undefined;

    await expect(answerFinancialQuestion({
      userId: "00000000-0000-4000-8000-000000000000",
      message: "Olá",
    })).rejects.toMatchObject({
      statusCode: 503,
      code: "ASSISTANT_NOT_CONFIGURED",
    });
  });
});
