import { afterEach, describe, expect, it, vi } from "vitest";
import { toAssistantProviderError } from "../../src/services/financial-assistant.service.js";

describe("erros do provedor do assistente financeiro", () => {
  afterEach(() => vi.restoreAllMocks());

  it("traduz um 404 do Gemini em 502 sem expor a mensagem do provedor ao cliente", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const providerError = Object.assign(new Error("Gemini request failed with 404"), {
      status: 404,
      code: "NOT_FOUND",
      model: "gemini-2.5-flash",
      providerMessage: "models/gemini-2.5-flash is not available for this project",
    });

    const result = toAssistantProviderError(providerError);

    expect(result).toMatchObject({
      statusCode: 502,
      code: "ASSISTANT_PROVIDER_ERROR",
      details: { providerStatus: 404, providerCode: "NOT_FOUND", providerModel: "gemini-2.5-flash" },
    });
    expect(result.details).not.toHaveProperty("providerMessage");
    expect(errorLog).toHaveBeenCalledWith("Falha ao consultar o provedor de IA", expect.objectContaining({ providerMessage: providerError.providerMessage }));
  });

  it("mantém falhas de credencial e de limite como indisponibilidade controlada", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(toAssistantProviderError(Object.assign(new Error("forbidden"), { status: 403 }))).toMatchObject({
      statusCode: 503,
      code: "ASSISTANT_PROVIDER_CONFIGURATION",
    });
    expect(toAssistantProviderError(Object.assign(new Error("rate limit"), { status: 429 }))).toMatchObject({
      statusCode: 503,
      code: "ASSISTANT_PROVIDER_BUSY",
    });
  });
});
