import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeName } from "../utils/normalize-name.js";
import { annualRateForYield, getFinancialIndices } from "./financial-index.service.js";

const investmentInclude = {
  goal: true,
  contributions: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
};

function asDate(value) { return new Date(`${value}T00:00:00.000Z`); }
function nullable(value) { return value?.trim() || null; }
function asDecimalString(value) { return new Prisma.Decimal(value || 0).toDecimalPlaces(4).toString(); }
function daysBusinessBetween(start, end = new Date()) {
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const finish = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  let days = 0;
  while (current < finish) {
    const weekday = current.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}
function automaticEarnings(contributions, annualRate) {
  if (annualRate == null) return 0;
  return contributions.reduce((sum, contribution) => {
    const businessDays = daysBusinessBetween(contribution.yieldStartDate || contribution.date);
    const amount = Number(contribution.amount);
    return sum + amount * (Math.pow(1 + annualRate / 100, businessDays / 252) - 1);
  }, 0);
}
function serializeContribution(contribution) {
  const { userId: _userId, amount, ...rest } = contribution;
  return { ...rest, amount: amount.toString(), date: contribution.date.toISOString().slice(0, 10) };
}
function serializeLegacyGoal(goal) {
  const { userId: _userId, targetAmount, currentAmount, ...rest } = goal;
  return { ...rest, targetAmount: targetAmount.toString(), currentAmount: currentAmount.toString(), deadline: goal.deadline?.toISOString().slice(0, 10) || null };
}
function serializeInvestment(investment, indices) {
  const totalInvested = investment.contributions.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
  const annualRate = annualRateForYield(investment.yieldType, investment.indexPercentage, investment.manualRate, indices);
  const earnings = new Prisma.Decimal(Number(investment.manualEarnings) + automaticEarnings(investment.contributions, annualRate)).toDecimalPlaces(4);
  const currentAmount = totalInvested.plus(earnings).toDecimalPlaces(4);
  const goal = investment.goal ? {
    id: investment.goal.id,
    targetAmount: investment.goal.targetAmount.toString(),
    deadline: investment.goal.deadline?.toISOString().slice(0, 10) || null,
    notes: investment.goal.notes || null,
    status: investment.goal.status,
  } : null;
  const target = goal ? new Prisma.Decimal(goal.targetAmount) : null;
  const progress = target ? currentAmount.div(target).times(100).toDecimalPlaces(2) : null;
  const remaining = target ? Prisma.Decimal.max(target.minus(currentAmount), new Prisma.Decimal(0)).toDecimalPlaces(4) : null;
  const { userId: _userId, investedAmount: _storedInvested, currentAmount: _storedCurrent, manualEarnings, contributions, ...publicInvestment } = investment;
  return {
    ...publicInvestment,
    investedAmount: totalInvested.toString(),
    earnings: earnings.toString(),
    manualEarnings: manualEarnings.toString(),
    currentAmount: currentAmount.toString(),
    profit: earnings.toString(),
    profitPercent: totalInvested.isZero() ? "0" : earnings.div(totalInvested).times(100).toDecimalPlaces(2).toString(),
    effectiveAnnualRate: annualRate == null ? null : annualRate.toFixed(6),
    goal,
    goalProgress: progress?.toString() ?? null,
    goalRemaining: remaining?.toString() ?? null,
    goalAchieved: target ? currentAmount.greaterThanOrEqualTo(target) : false,
    contributions: contributions.map(serializeContribution),
  };
}
async function validateAccount(db, userId, accountId) {
  if (!accountId) return;
  const account = await db.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new AppError("Conta não encontrada", 404, "ACCOUNT_NOT_FOUND");
}
async function ensureUniqueName(db, userId, name, ignoredId) {
  const existing = await db.investment.findFirst({ where: { userId, normalizedName: normalizeName(name), ...(ignoredId ? { id: { not: ignoredId } } : {}) } });
  if (existing) throw new AppError("Já existe investimento com este nome", 409, "INVESTMENT_NAME_IN_USE");
}
async function findInvestment(db, userId, id, include = false) {
  const investment = await db.investment.findFirst({ where: { id, userId }, ...(include ? { include: investmentInclude } : {}) });
  if (!investment) throw new AppError("Investimento não encontrado", 404, "INVESTMENT_NOT_FOUND");
  return investment;
}
async function syncInvestmentTotals(db, investment) {
  const total = await db.investmentContribution.aggregate({ where: { userId: investment.userId, investmentId: investment.id }, _sum: { amount: true } });
  const investedAmount = new Prisma.Decimal(total._sum.amount ?? 0);
  return db.investment.update({ where: { id: investment.id }, data: { investedAmount, currentAmount: investedAmount.plus(investment.manualEarnings) } });
}
async function safeIndices() {
  try { return await getFinancialIndices(); } catch { return { indices: [], stale: true, refreshed: false, unavailable: true }; }
}

export async function listInvestments(userId) {
  const [records, indexState, legacyGoals] = await Promise.all([
    prisma.investment.findMany({ where: { userId }, include: investmentInclude, orderBy: { applicationDate: "desc" } }),
    safeIndices(),
    prisma.financialGoal.findMany({ where: { userId, investmentId: null }, orderBy: { createdAt: "asc" } }),
  ]);
  const investments = records.map((item) => serializeInvestment(item, indexState.indices));
  const totalInvested = investments.reduce((sum, item) => sum.plus(item.investedAmount), new Prisma.Decimal(0));
  const totalEarnings = investments.reduce((sum, item) => sum.plus(item.earnings), new Prisma.Decimal(0));
  return {
    investments, legacyGoals: legacyGoals.map(serializeLegacyGoal), indices: indexState.indices, indicesStale: indexState.stale, indicesUnavailable: indexState.unavailable ?? false,
    totalInvested: totalInvested.toString(), totalEarnings: totalEarnings.toString(), totalCurrent: totalInvested.plus(totalEarnings).toString(),
  };
}

export async function getInvestment(userId, id) {
  const [investment, indexState] = await Promise.all([findInvestment(prisma, userId, id, true), safeIndices()]);
  return { investment: serializeInvestment(investment, indexState.indices), indices: indexState.indices, indicesStale: indexState.stale, indicesUnavailable: indexState.unavailable ?? false };
}

export async function createInvestment(userId, data) {
  const created = await prisma.$transaction(async (db) => {
    await Promise.all([ensureUniqueName(db, userId, data.name), validateAccount(db, userId, data.accountId)]);
    const investment = await db.investment.create({ data: {
      userId, accountId: data.accountId || null, name: data.name, normalizedName: normalizeName(data.name), institution: nullable(data.institution), type: data.type,
      investedAmount: data.initialAmount, currentAmount: new Prisma.Decimal(data.initialAmount).plus(data.manualEarnings || 0), manualEarnings: data.manualEarnings || "0",
      applicationDate: asDate(data.applicationDate), maturityDate: data.maturityDate ? asDate(data.maturityDate) : null, liquidity: nullable(data.liquidity),
      yieldType: data.yieldType, referenceIndex: nullable(data.referenceIndex), indexPercentage: data.indexPercentage || null, manualRate: data.manualRate || null, notes: nullable(data.notes), isActive: data.isActive ?? true,
    } });
    await db.investmentContribution.create({ data: { userId, investmentId: investment.id, amount: data.initialAmount, date: asDate(data.applicationDate), yieldStartDate: asDate(data.applicationDate), notes: nullable(data.initialContributionNotes) } });
    if (data.targetAmount) {
      await db.financialGoal.create({ data: { userId, investmentId: investment.id, name: `Meta de ${data.name}`, normalizedName: normalizeName(`Meta de investimento ${data.name}`), targetAmount: data.targetAmount, currentAmount: "0", deadline: data.goalDeadline ? asDate(data.goalDeadline) : null, notes: nullable(data.goalNotes) } });
    }
    return findInvestment(db, userId, investment.id, true);
  });
  const indexState = await safeIndices();
  return serializeInvestment(created, indexState.indices);
}

export async function updateInvestment(userId, id, data) {
  const updated = await prisma.$transaction(async (db) => {
    const existing = await findInvestment(db, userId, id, true);
    if (data.name !== undefined) await ensureUniqueName(db, userId, data.name, id);
    if (data.accountId !== undefined) await validateAccount(db, userId, data.accountId);
    const investment = await db.investment.update({ where: { id }, data: {
      ...(data.name !== undefined ? { name: data.name, normalizedName: normalizeName(data.name) } : {}), ...(data.institution !== undefined ? { institution: nullable(data.institution) } : {}),
      ...(data.accountId !== undefined ? { accountId: data.accountId || null } : {}), ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.applicationDate !== undefined ? { applicationDate: asDate(data.applicationDate) } : {}), ...(data.maturityDate !== undefined ? { maturityDate: data.maturityDate ? asDate(data.maturityDate) : null } : {}),
      ...(data.liquidity !== undefined ? { liquidity: nullable(data.liquidity) } : {}), ...(data.yieldType !== undefined ? { yieldType: data.yieldType } : {}), ...(data.referenceIndex !== undefined ? { referenceIndex: nullable(data.referenceIndex) } : {}),
      ...(data.indexPercentage !== undefined ? { indexPercentage: data.indexPercentage || null } : {}), ...(data.manualRate !== undefined ? { manualRate: data.manualRate || null } : {}), ...(data.manualEarnings !== undefined ? { manualEarnings: data.manualEarnings } : {}),
      ...(data.notes !== undefined ? { notes: nullable(data.notes) } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    } });
    if (data.targetAmount !== undefined) {
      if (data.targetAmount === null) {
        if (existing.goal) await db.financialGoal.delete({ where: { id: existing.goal.id } });
      } else if (existing.goal) {
        await db.financialGoal.update({ where: { id: existing.goal.id }, data: {
          targetAmount: data.targetAmount,
          ...(data.name !== undefined ? { name: `Meta de investimento ${investment.name}`, normalizedName: normalizeName(`Meta de investimento ${investment.name}`) } : {}),
          deadline: data.goalDeadline === undefined ? undefined : (data.goalDeadline ? asDate(data.goalDeadline) : null),
          notes: data.goalNotes === undefined ? undefined : nullable(data.goalNotes),
        } });
      } else await db.financialGoal.create({ data: { userId, investmentId: id, name: `Meta de investimento ${investment.name}`, normalizedName: normalizeName(`Meta de investimento ${investment.name}`), targetAmount: data.targetAmount, currentAmount: "0", deadline: data.goalDeadline ? asDate(data.goalDeadline) : null, notes: nullable(data.goalNotes) } });
    }
    await syncInvestmentTotals(db, investment);
    return findInvestment(db, userId, id, true);
  });
  const indexState = await safeIndices();
  return serializeInvestment(updated, indexState.indices);
}

export async function deleteInvestment(userId, id) {
  await prisma.$transaction(async (db) => {
    await findInvestment(db, userId, id);
    await db.financialGoal.deleteMany({ where: { userId, investmentId: id } });
    await db.investmentContribution.deleteMany({ where: { userId, investmentId: id } });
    await db.investment.delete({ where: { id } });
  });
}

export async function createContribution(userId, investmentId, data) {
  const contribution = await prisma.$transaction(async (db) => {
    const investment = await findInvestment(db, userId, investmentId);
    if (!investment.isActive) throw new AppError("Não é possível aportar em um investimento inativo", 409, "INVESTMENT_INACTIVE");
    const created = await db.investmentContribution.create({ data: { userId, investmentId, amount: data.amount, date: asDate(data.date), yieldStartDate: asDate(data.date), notes: nullable(data.notes) } });
    await syncInvestmentTotals(db, investment);
    return created;
  });
  return serializeContribution(contribution);
}

export async function updateContribution(userId, id, data) {
  const contribution = await prisma.$transaction(async (db) => {
    const existing = await db.investmentContribution.findFirst({ where: { id, userId }, include: { investment: true } });
    if (!existing) throw new AppError("Aporte não encontrado", 404, "CONTRIBUTION_NOT_FOUND");
    const updated = await db.investmentContribution.update({ where: { id }, data: { ...(data.amount !== undefined ? { amount: data.amount } : {}), ...(data.date !== undefined ? { date: asDate(data.date), yieldStartDate: asDate(data.date) } : {}), ...(data.notes !== undefined ? { notes: nullable(data.notes) } : {}) } });
    await syncInvestmentTotals(db, existing.investment);
    return updated;
  });
  return serializeContribution(contribution);
}

export async function deleteContribution(userId, id) {
  await prisma.$transaction(async (db) => {
    const existing = await db.investmentContribution.findFirst({ where: { id, userId }, include: { investment: true } });
    if (!existing) throw new AppError("Aporte não encontrado", 404, "CONTRIBUTION_NOT_FOUND");
    await db.investmentContribution.delete({ where: { id } });
    await syncInvestmentTotals(db, existing.investment);
  });
}

export async function adoptLegacyGoal(userId, investmentId, goalId) {
  const updated = await prisma.$transaction(async (db) => {
    await findInvestment(db, userId, investmentId);
    const goal = await db.financialGoal.findFirst({ where: { id: goalId, userId, investmentId: null } });
    if (!goal) throw new AppError("Meta antiga não encontrada", 404, "LEGACY_GOAL_NOT_FOUND");
    await db.financialGoal.update({ where: { id: goalId }, data: { investmentId } });
    return findInvestment(db, userId, investmentId, true);
  });
  const indexState = await safeIndices();
  return serializeInvestment(updated, indexState.indices);
}

export async function refreshIndices() {
  return getFinancialIndices({ forceRefresh: true });
}
