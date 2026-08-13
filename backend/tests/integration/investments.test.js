import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";

const agent = request.agent(app);
const suffix = randomUUID();
let userId; let investmentId; let firstContributionId;

async function seedIndexCache() {
  const now = new Date(); const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  await Promise.all([
    prisma.financialIndex.upsert({ where: { code: "CDI" }, create: { code: "CDI", rate: "0.05", period: "DAILY", source: "teste", referenceDate: now, fetchedAt: now, expiresAt }, update: { rate: "0.05", period: "DAILY", source: "teste", referenceDate: now, fetchedAt: now, expiresAt } }),
    prisma.financialIndex.upsert({ where: { code: "SELIC" }, create: { code: "SELIC", rate: "14.25", period: "ANNUAL", source: "teste", referenceDate: now, fetchedAt: now, expiresAt }, update: { rate: "14.25", period: "ANNUAL", source: "teste", referenceDate: now, fetchedAt: now, expiresAt } }),
    prisma.financialIndex.upsert({ where: { code: "IPCA" }, create: { code: "IPCA", rate: "4.5", period: "ANNUAL", source: "teste", referenceDate: now, fetchedAt: now, expiresAt }, update: { rate: "4.5", period: "ANNUAL", source: "teste", referenceDate: now, fetchedAt: now, expiresAt } }),
  ]);
}
async function cleanup() {
  if (userId) await prisma.$transaction([
    prisma.financialGoal.deleteMany({ where: { userId } }), prisma.investmentContribution.deleteMany({ where: { userId } }), prisma.investment.deleteMany({ where: { userId } }),
    prisma.subcategory.deleteMany({ where: { userId } }), prisma.category.deleteMany({ where: { userId } }), prisma.account.deleteMany({ where: { userId } }), prisma.user.delete({ where: { id: userId } }),
  ]);
}

describe.sequential("investimentos, aportes, metas e índices", () => {
  afterAll(async () => { vi.unstubAllGlobals(); await cleanup(); await prisma.$disconnect(); });
  it("cria investimento e meta juntos com 110% do CDI", async () => {
    await seedIndexCache();
    const registered = await agent.post("/api/auth/register").send({ name: "Investidor", email: `investidor-${suffix}@example.test`, password: "SenhaSegura123", currency: "BRL" });
    expect(registered.status).toBe(201); userId = registered.body.user.id;
    const created = await agent.post("/api/investments").send({ name: "CDB Banco X", type: "CDB", initialAmount: "1000", targetAmount: "10000", applicationDate: "2026-01-02", yieldType: "CDI_PERCENT", indexPercentage: "110" });
    expect(created.status).toBe(201); investmentId = created.body.investment.id;
    expect(created.body.investment).toMatchObject({ investedAmount: "1000", goal: { targetAmount: "10000" } });
    expect(created.body.investment.contributions).toHaveLength(1); firstContributionId = created.body.investment.contributions[0].id;
    expect(created.body.investment.effectiveAnnualRate).not.toBeNull();
  });
  it("registra vários aportes no mesmo investimento e preserva o histórico", async () => {
    const first = await agent.post(`/api/investments/${investmentId}/contributions`).send({ amount: "500", date: "2026-09-01" });
    const second = await agent.post(`/api/investments/${investmentId}/contributions`).send({ amount: "500", date: "2026-10-01", notes: "Aporte mensal" });
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    const listed = await agent.get("/api/investments");
    expect(listed.status).toBe(200); expect(listed.body.investments).toHaveLength(1);
    expect(listed.body.investments[0]).toMatchObject({ id: investmentId, investedAmount: "2000" });
    expect(listed.body.investments[0].contributions.map((item) => item.date)).toEqual(["2026-01-02", "2026-09-01", "2026-10-01"]);
    const edited = await agent.patch(`/api/investments/contributions/${firstContributionId}`).send({ amount: "1000", date: "2026-01-02" });
    expect(edited.status).toBe(200);
  });
  it("separa aportes, rendimentos, valor atual e progresso da meta", async () => {
    const contribution = await agent.post(`/api/investments/${investmentId}/contributions`).send({ amount: "3000", date: "2026-11-01" });
    expect(contribution.status).toBe(201);
    const temporary = await agent.post(`/api/investments/${investmentId}/contributions`).send({ amount: "100", date: "2026-11-02" });
    expect(temporary.status).toBe(201);
    expect((await agent.delete(`/api/investments/contributions/${temporary.body.contribution.id}`)).status).toBe(204);
    const updated = await agent.patch(`/api/investments/${investmentId}`).send({ yieldType: "CUSTOM", manualEarnings: "350", targetAmount: "10000" });
    expect(updated.status).toBe(200);
    const listed = await agent.get("/api/investments");
    const investment = listed.body.investments.find((item) => item.id === investmentId);
    expect(investment).toMatchObject({ investedAmount: "5000", earnings: "350", currentAmount: "5350", goalProgress: "53.5", goalRemaining: "4650" });
  });
  it("atualiza os índices pelo BCB e usa o último valor válido quando a fonte falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (String(url).includes(".12/")) return new Response(JSON.stringify([{ data: "13/08/2026", valor: "0.052" }]), { status: 200 });
      if (String(url).includes(".432/")) return new Response(JSON.stringify([{ data: "13/08/2026", valor: "15,00" }]), { status: 200 });
      return new Response(JSON.stringify([{ data: "01/08/2026", valor: "4,80" }]), { status: 200 });
    }));
    const refreshed = await agent.post("/api/investments/indices/refresh");
    expect(refreshed.status).toBe(200); expect(refreshed.body.refreshed).toBe(true); expect(refreshed.body.indices.find((item) => item.code === "CDI").rate).toBe("0.052");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("fonte indisponível"); }));
    const fallback = await agent.post("/api/investments/indices/refresh");
    expect(fallback.status).toBe(200); expect(fallback.body.stale).toBe(true); expect(fallback.body.indices).toHaveLength(3);
  });
});
