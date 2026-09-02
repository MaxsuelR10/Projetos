import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeName } from "../utils/normalize-name.js";

function asDate(value) { return new Date(`${value}T00:00:00.000Z`); }
function serializeBudget(item, usedAmount = new Prisma.Decimal(0)) { return { ...item, limitAmount: item.limitAmount.toString(), usedAmount: usedAmount.toString(), percent: usedAmount.div(item.limitAmount).times(100).toNumber() }; }
function serializeGoal(item) { return { ...item, targetAmount: item.targetAmount.toString(), currentAmount: item.currentAmount.toString(), progress: item.currentAmount.div(item.targetAmount).times(100).toNumber() }; }

export async function listBudgets(userId, year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1)); const end = new Date(Date.UTC(year, month, 1));
  const budgets = await prisma.budget.findMany({ where: { userId, year, month }, include: { category: { select: { name: true } } } });
  const spending = await prisma.transaction.groupBy({ by: ["categoryId"], where: { userId, type: "EXPENSE", status: { not: "CANCELLED" }, creditCardInvoiceId: null, date: { gte: start, lt: end }, categoryId: { in: budgets.map((item) => item.categoryId) } }, _sum: { amount: true } });
  const byCategory = new Map(spending.map((item) => [item.categoryId, item._sum.amount ?? new Prisma.Decimal(0)]));
  return budgets.map((item) => serializeBudget(item, byCategory.get(item.categoryId)));
}
export async function saveBudget(userId, data) {
  const category = await prisma.category.findFirst({ where: { id: data.categoryId, userId, type: "EXPENSE", isActive: true } });
  if (!category) throw new AppError("Categoria de despesa ativa não encontrada", 404, "CATEGORY_NOT_FOUND");
  const budget = await prisma.budget.upsert({ where: { userId_categoryId_year_month: { userId, categoryId: data.categoryId, year: data.year, month: data.month } }, create: { userId, ...data }, update: { limitAmount: data.limitAmount } });
  return serializeBudget(budget);
}
export async function listGoals(userId) { return (await prisma.financialGoal.findMany({ where: { userId }, orderBy: { deadline: "asc" } })).map(serializeGoal); }
export async function createGoal(userId, data) {
  if (data.accountId && !(await prisma.account.findFirst({ where: { id: data.accountId, userId } }))) throw new AppError("Conta não encontrada", 404, "ACCOUNT_NOT_FOUND");
  const normalizedName = normalizeName(data.name);
  if (await prisma.financialGoal.findFirst({ where: { userId, normalizedName } })) throw new AppError("Já existe uma meta com este nome", 409, "GOAL_NAME_IN_USE");
  return serializeGoal(await prisma.financialGoal.create({ data: { userId, name: data.name, normalizedName, targetAmount: data.targetAmount, currentAmount: data.currentAmount, deadline: data.deadline ? asDate(data.deadline) : null, notes: data.notes || null, accountId: data.accountId || null } }));
}
