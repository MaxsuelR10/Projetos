import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

describe("contrato público da API", () => {
  it("expõe envelope de sucesso sem remover os dados legados", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { status: "ok" }, status: "ok" });
  });

  it("expõe erro seguro e padronizado", async () => {
    const response = await request(app).get("/api/nao-existe");
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, code: "NOT_FOUND", message: expect.any(String) });
    expect(response.body.message).not.toMatch(/prisma|sql|stack/i);
  });
});
