import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeName } from "../utils/normalize-name.js";

function asDate(value) { return new Date(`${value}T00:00:00.000Z`); }
function nullable(value) { return value?.trim() || null; }
function serialize(item) { const profit = item.currentAmount.minus(item.investedAmount); return { ...item, investedAmount: item.investedAmount.toString(), currentAmount: item.currentAmount.toString(), profit: profit.toString(), profitPercent: item.investedAmount.isZero() ? "0" : profit.div(item.investedAmount).times(100).toDecimalPlaces(4).toString() }; }
export async function listInvestments(userId) { const rows = await prisma.investment.findMany({ where: { userId }, orderBy: { applicationDate: "desc" } }); const totals = rows.reduce((result, item) => ({ invested: result.invested.plus(item.investedAmount), current: result.current.plus(item.currentAmount) }), { invested: new Prisma.Decimal(0), current: new Prisma.Decimal(0) }); return { investments: rows.map(serialize), totalInvested: totals.invested.toString(), totalCurrent: totals.current.toString() }; }
export async function createInvestment(userId, data) {
  const normalizedName = normalizeName(data.name); if (await prisma.investment.findFirst({ where: { userId, normalizedName } })) throw new AppError("Já existe investimento com este nome", 409, "INVESTMENT_NAME_IN_USE");
  if (data.accountId && !(await prisma.account.findFirst({ where: { id: data.accountId, userId } }))) throw new AppError("Conta não encontrada", 404, "ACCOUNT_NOT_FOUND");
  return serialize(await prisma.investment.create({ data: { userId, name: data.name, normalizedName, accountId: data.accountId || null, institution: nullable(data.institution), type: data.type, investedAmount: data.investedAmount, currentAmount: data.currentAmount, applicationDate: asDate(data.applicationDate), maturityDate: data.maturityDate ? asDate(data.maturityDate) : null, yieldType: data.yieldType, manualRate: data.manualRate, referenceIndex: nullable(data.referenceIndex), notes: nullable(data.notes) } }));
}
export async function updateInvestment(userId, id, data) { const existing = await prisma.investment.findFirst({ where: { id, userId } }); if (!existing) throw new AppError("Investimento não encontrado", 404, "INVESTMENT_NOT_FOUND"); return serialize(await prisma.investment.update({ where: { id }, data })); }
