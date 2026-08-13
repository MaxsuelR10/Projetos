import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";

const BCB_SGS_BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";
const CACHE_HOURS = Math.max(1, Number(process.env.FINANCIAL_INDEX_CACHE_HOURS || 12));
const INDEX_DEFINITIONS = {
  CDI: { series: 12, period: "DAILY", source: "Banco Central do Brasil — SGS 12" },
  SELIC: { series: 432, period: "ANNUAL", source: "Banco Central do Brasil — SGS 432" },
  IPCA: { series: 13522, period: "ANNUAL", source: "Banco Central do Brasil — SGS 13522" },
};

function parseBcbDate(value) {
  const [day, month, year] = String(value).split("/").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function parseBcbRate(value) {
  const raw = String(value).trim();
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  const decimalSeparator = comma > dot ? "," : ".";
  const normalized = decimalSeparator === ","
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const rate = Number(normalized);
  if (!Number.isFinite(rate)) throw new Error("Valor de índice inválido retornado pelo BCB");
  return rate;
}

function serializeIndex(index, stale = false) {
  return {
    code: index.code,
    rate: index.rate.toString(),
    period: index.period,
    source: index.source,
    referenceDate: index.referenceDate.toISOString().slice(0, 10),
    fetchedAt: index.fetchedAt.toISOString(),
    expiresAt: index.expiresAt.toISOString(),
    stale,
  };
}

async function fetchBcbIndex(code, definition, fetcher = globalThis.fetch) {
  if (typeof fetcher !== "function") throw new Error("Fetch indisponível para atualizar os índices financeiros");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(`${BCB_SGS_BASE_URL}.${definition.series}/dados/ultimos/1?formato=json`, { signal: controller.signal });
    if (!response.ok) throw new Error(`BCB respondeu ${response.status}`);
    const rows = await response.json();
    const latest = rows?.[0];
    if (!latest?.data || latest.valor === undefined) throw new Error("BCB não retornou uma cotação válida");
    return { code, rate: parseBcbRate(latest.valor), period: definition.period, source: definition.source, referenceDate: parseBcbDate(latest.data) };
  } finally {
    clearTimeout(timeout);
  }
}

export function cdiDailyRateToAnnualRate(dailyRate) {
  return (Math.pow(1 + Number(dailyRate) / 100, 252) - 1) * 100;
}

export async function getFinancialIndices({ forceRefresh = false, fetcher } = {}) {
  const cached = await prisma.financialIndex.findMany({ where: { code: { in: Object.keys(INDEX_DEFINITIONS) } } });
  const byCode = new Map(cached.map((item) => [item.code, item]));
  const now = new Date();
  const cacheIsFresh = Object.keys(INDEX_DEFINITIONS).every((code) => byCode.get(code)?.expiresAt > now);
  if (!forceRefresh && cacheIsFresh) return { indices: cached.map((item) => serializeIndex(item)), stale: false, refreshed: false };

  const settled = await Promise.allSettled(Object.entries(INDEX_DEFINITIONS).map(async ([code, definition]) => fetchBcbIndex(code, definition, fetcher)));
  const fresh = settled.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const expiresAt = new Date(now.getTime() + CACHE_HOURS * 60 * 60 * 1000);
  if (fresh.length) {
    await prisma.$transaction(fresh.map((item) => prisma.financialIndex.upsert({
      where: { code: item.code },
      create: { ...item, fetchedAt: now, expiresAt },
      update: { rate: item.rate, period: item.period, source: item.source, referenceDate: item.referenceDate, fetchedAt: now, expiresAt },
    })));
  }

  const refreshedCache = await prisma.financialIndex.findMany({ where: { code: { in: Object.keys(INDEX_DEFINITIONS) } } });
  if (!refreshedCache.length) {
    throw new AppError("Os índices financeiros não estão disponíveis no momento", 503, "FINANCIAL_INDEX_SOURCE_UNAVAILABLE");
  }
  const stale = fresh.length !== Object.keys(INDEX_DEFINITIONS).length;
  return { indices: refreshedCache.map((item) => serializeIndex(item, stale || item.expiresAt <= now)), stale, refreshed: fresh.length > 0 };
}

export function annualRateForYield(yieldType, indexPercentage, manualRate, indices) {
  const byCode = new Map(indices.map((item) => [item.code, Number(item.rate)]));
  if (yieldType === "CDI_PERCENT") {
    const dailyCdi = byCode.get("CDI");
    if (dailyCdi === undefined) return null;
    return cdiDailyRateToAnnualRate(dailyCdi) * (Number(indexPercentage ?? 100) / 100);
  }
  if (yieldType === "SELIC") return byCode.get("SELIC") ?? null;
  if (yieldType === "IPCA") return byCode.get("IPCA") ?? null;
  if (yieldType === "ANNUAL_RATE" || yieldType === "CUSTOM") return manualRate == null ? null : Number(manualRate);
  if (yieldType === "MONTHLY_RATE") return manualRate == null ? null : (Math.pow(1 + Number(manualRate) / 100, 12) - 1) * 100;
  return null;
}
