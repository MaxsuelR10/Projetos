import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
function monthBounds(value) { const [year, month] = (value || new Date().toISOString().slice(0, 7)).split("-").map(Number); return { year, month, start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) }; }
function money(value) { return (value || new Prisma.Decimal(0)).toString(); }
function add(map, key, amount) { map.set(key, (map.get(key) || new Prisma.Decimal(0)).plus(amount)); }
export async function getDashboard(userId, month) {
  const range = monthBounds(month); const completed = { userId, status: "COMPLETED", date: { gte: range.start, lt: range.end } };
  const [accounts, transactions, pending, overdue, cards, upcomingInvoices] = await Promise.all([
    prisma.account.findMany({ where: { userId, isActive: true }, select: { name: true, currentBalance: true, color: true } }),
    prisma.transaction.findMany({ where: completed, include: { category: { select: { name: true } } } }),
    prisma.transaction.aggregate({ where: { userId, status: "PENDING", dueDate: { gte: range.start, lt: range.end } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, status: "OVERDUE" }, _sum: { amount: true } }),
    prisma.creditCard.findMany({ where: { userId, type: "CREDIT", isActive: true }, select: { id: true, name: true, creditLimit: true } }),
    prisma.creditCardInvoice.findMany({ where: { userId, status: { not: "PAID" }, dueDate: { gte: range.start, lt: range.end } }, orderBy: { dueDate: "asc" }, take: 1, include: { creditCard: { select: { name: true } } } }),
  ]);
  let income = new Prisma.Decimal(0); let expense = new Prisma.Decimal(0); const categories = new Map();
  for (const item of transactions) { if (item.type === "INCOME") income = income.plus(item.amount); else { expense = expense.plus(item.amount); add(categories, item.category.name, item.amount); } }
  const cardUsage = await Promise.all(cards.map(async (card) => { const total = await prisma.cardInstallment.aggregate({ where: { userId, creditCardId: card.id, status: "PENDING" }, _sum: { amount: true } }); return { name: card.name, used: money(total._sum.amount), available: Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(card.creditLimit).minus(total._sum.amount || 0)).toString() }; }));
  const balance = accounts.reduce((total, item) => total.plus(item.currentBalance), new Prisma.Decimal(0));
  const series = []; for (let offset = 5; offset >= 0; offset -= 1) { const date = new Date(Date.UTC(range.year, range.month - 1 - offset, 1)); const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)); const values = await prisma.transaction.findMany({ where: { userId, status: "COMPLETED", date: { gte: date, lt: next } }, select: { type: true, amount: true } }); let inValue = new Prisma.Decimal(0); let outValue = new Prisma.Decimal(0); values.forEach((item) => { if (item.type === "INCOME") inValue = inValue.plus(item.amount); else outValue = outValue.plus(item.amount); }); series.push({ label: `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`, income: money(inValue), expense: money(outValue) }); }
  return { period: `${range.year}-${String(range.month).padStart(2, "0")}`, summary: { availableBalance: money(balance), monthlyIncome: money(income), monthlyExpense: money(expense), monthlyResult: money(income.minus(expense)), pendingBills: money(pending._sum.amount), overdueBills: money(overdue._sum.amount), totalCardUsed: money(cardUsage.reduce((total, item) => total.plus(item.used), new Prisma.Decimal(0))), investedTotal: "0", netWorth: money(balance) }, accounts: accounts.map((item) => ({ ...item, currentBalance: money(item.currentBalance) })), categoryExpenses: [...categories.entries()].map(([name, amount]) => ({ name, amount: money(amount) })).sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 6), monthlySeries: series, cards: cardUsage, nextInvoice: upcomingInvoices[0] ? { id: upcomingInvoices[0].id, cardName: upcomingInvoices[0].creditCard.name, dueDate: upcomingInvoices[0].dueDate, amount: money(upcomingInvoices[0].totalAmount) } : null };
}
