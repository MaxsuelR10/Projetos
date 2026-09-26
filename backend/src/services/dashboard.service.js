import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import {
  monthBounds,
  transactionCompetenceFilter,
} from "../utils/financial-competence.js";

function money(value) {
  return (value || new Prisma.Decimal(0)).toString();
}

function add(map, key, amount) {
  map.set(key, (map.get(key) || new Prisma.Decimal(0)).plus(amount));
}

function cashPeriodTransactions(userId, range) {
  const period = { gte: range.start, lt: range.end };
  return {
    userId,
    status: "COMPLETED",
    cardPurchaseId: null,
    OR: [
      { settledAt: period },
      { settledAt: null, date: period },
    ],
  };
}

function pendingPeriodTransactions(userId, range) {
  return {
    userId,
    type: "EXPENSE",
    status: { in: ["PENDING", "OVERDUE"] },
    cardPurchaseId: null,
    creditCardInvoiceId: null,
    ...transactionCompetenceFilter(range),
  };
}

// Projected balance intentionally continues to consume only obligations already due.
// The monthly summary itself is period-based and is calculated by getPeriodTotals.
function dueNonCardCommitment() {
  return {
    type: "EXPENSE",
    cardPurchaseId: null,
    creditCardInvoiceId: null,
    OR: [
      { status: "OVERDUE" },
      { status: "PENDING", dueDate: { lte: new Date() } },
    ],
  };
}

async function getCashPeriodTotals(userId, range) {
  const transactions = await prisma.transaction.findMany({
    where: cashPeriodTransactions(userId, range),
    include: { category: { select: { name: true } } },
  });

  let income = new Prisma.Decimal(0);
  let expense = new Prisma.Decimal(0);
  const categories = new Map();

  for (const transaction of transactions) {
    if (transaction.type === "INCOME") income = income.plus(transaction.amount);
    else {
      expense = expense.plus(transaction.amount);
      add(categories, transaction.category.name, transaction.amount);
    }
  }

  return { income, expense, categories };
}

function dateRange(from, to) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

async function getExpenseBreakdown(userId, range) {
  const [cashExpenses, cardInstallments] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        ...cashPeriodTransactions(userId, range),
        type: "EXPENSE",
        creditCardInvoiceId: null,
      },
      include: { category: { select: { name: true } } },
    }),
    prisma.cardInstallment.findMany({
      where: {
        userId,
        status: "PENDING",
        invoice: {
          status: { not: "PAID" },
          dueDate: { gte: range.start, lt: range.end },
        },
      },
      include: { purchase: { include: { category: { select: { name: true } } } } },
    }),
  ]);

  const categories = new Map();
  cashExpenses.forEach((transaction) => add(categories, transaction.category.name, transaction.amount));
  cardInstallments.forEach((installment) => add(categories, installment.purchase.category.name, installment.amount));

  return [...categories.entries()]
    .map(([name, amount]) => ({ name, amount: money(amount) }))
    .sort((first, second) => Number(second.amount) - Number(first.amount));
}

export async function getDashboard(userId, query = {}) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const startMonth = query.startMonth ?? query.month ?? query.startDate?.slice(0, 7) ?? currentMonth;
  const endMonth = query.endMonth ?? query.endDate?.slice(0, 7) ?? startMonth;
  const months = query.months ?? 6;
  const startRange = monthBounds(startMonth);
  const endRange = monthBounds(endMonth);
  const rangeStart = query.startDate ?? startRange.start.toISOString().slice(0, 10);
  const rangeEnd = query.endDate ?? new Date(endRange.end.getTime() - 86_400_000).toISOString().slice(0, 10);
  const range = dateRange(rangeStart, rangeEnd);
  const expenseFrom = query.expenseFrom ?? rangeStart;
  const expenseTo = query.expenseTo ?? rangeEnd;
  const expenseRange = dateRange(expenseFrom, expenseTo);

  const seriesRanges = Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(endRange.year, endRange.month - months + index, 1));
    return monthBounds(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  });

  const [
    periodTotals,
    accounts,
    inactiveAccounts,
    investmentsAggregate,
    pending,
    pendingCardInstallments,
    cards,
    upcomingInvoices,
    expenseBreakdown,
  ] = await Promise.all([
    getCashPeriodTotals(userId, range),
    prisma.account.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, currentBalance: true, color: true },
    }),
    prisma.account.findMany({
      where: { userId, isActive: false },
      select: { id: true, name: true, currentBalance: true },
    }),
    prisma.investment.aggregate({
      where: { userId, isActive: true },
      _sum: { currentAmount: true },
    }),
    prisma.transaction.aggregate({
      where: pendingPeriodTransactions(userId, range),
      _sum: { amount: true },
    }),
    prisma.cardInstallment.findMany({
      where: {
        userId,
        status: "PENDING",
        invoice: {
          dueDate: { gte: range.start, lt: range.end },
          status: { not: "PAID" },
        },
      },
      select: { amount: true, dueDate: true },
    }),
    prisma.creditCard.findMany({
      where: { userId, type: "CREDIT", isActive: true },
      select: { id: true, name: true, creditLimit: true },
    }),
    prisma.creditCardInvoice.findMany({
      where: {
        userId,
        status: { not: "PAID" },
        dueDate: { gte: range.start, lt: range.end },
      },
      orderBy: { dueDate: "asc" },
      take: 1,
      include: { creditCard: { select: { name: true } } },
    }),
    getExpenseBreakdown(userId, expenseRange),
  ]);

  const [seriesTotals, cardUsage, commitments, overdueTransactions] =
    await Promise.all([
      Promise.all(
        seriesRanges.map((seriesRange) => getCashPeriodTotals(userId, seriesRange)),
      ),
      Promise.all(
        cards.map(async (card) => {
          const total = await prisma.cardInstallment.aggregate({
            where: { userId, creditCardId: card.id, status: "PENDING" },
            _sum: { amount: true },
          });
          return {
            name: card.name,
            used: money(total._sum.amount),
            available: Prisma.Decimal.max(
              new Prisma.Decimal(0),
              new Prisma.Decimal(card.creditLimit).minus(
                total._sum.amount || 0,
              ),
            ).toString(),
          };
        }),
      ),
      prisma.transaction.groupBy({
        by: ["accountId"],
        where: { userId, ...dueNonCardCommitment() },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          ...pendingPeriodTransactions(userId, range),
          status: "OVERDUE",
        },
        _sum: { amount: true },
      }),
    ]);

  const cardPending = pendingCardInstallments.reduce(
    (total, installment) => total.plus(installment.amount),
    new Prisma.Decimal(0),
  );
  const cardOverdue = pendingCardInstallments
    .filter((installment) => installment.dueDate < new Date())
    .reduce(
      (total, installment) => total.plus(installment.amount),
      new Prisma.Decimal(0),
    );
  const pendingAmount = new Prisma.Decimal(pending._sum.amount || 0);
  const commitmentsByAccount = new Map(
    commitments.map((item) => [
      item.accountId,
      item._sum.amount ?? new Prisma.Decimal(0),
    ]),
  );
  const balance = accounts.reduce(
    (total, item) => total.plus(item.currentBalance),
    new Prisma.Decimal(0),
  );
  const inactiveBalance = inactiveAccounts.reduce(
    (total, item) => total.plus(item.currentBalance),
    new Prisma.Decimal(0),
  );
  const projectedBalance = accounts.reduce(
    (total, item) =>
      total
        .plus(item.currentBalance)
        .minus(commitmentsByAccount.get(item.id) ?? 0),
    new Prisma.Decimal(0),
  );
  const investedTotal = new Prisma.Decimal(
    investmentsAggregate._sum.currentAmount || 0,
  );
  const netWorth = balance.plus(inactiveBalance).plus(investedTotal);

  // Cash-basis result: money actually received minus money actually paid in the period.
  const monthlyResult = periodTotals.income.minus(periodTotals.expense);

  const totalPendingBills = pendingAmount.plus(cardPending);
  const paidBills = periodTotals.expense;

  return {
    period: endMonth,
    periodRange: { startMonth, endMonth, startDate: rangeStart, endDate: rangeEnd },
    expensePeriod: {
      from: expenseFrom,
      to: expenseTo,
    },
    summary: {
      availableBalance: money(balance),
      currentBalance: money(balance),
      projectedBalance: money(projectedBalance),
      monthlyIncome: money(periodTotals.income),
      monthlyExpense: money(periodTotals.expense),
      monthlyResult: money(monthlyResult),
      pendingBills: money(totalPendingBills),
      paidBills: money(paidBills),
      overdueBills: money(
        new Prisma.Decimal(overdueTransactions._sum.amount || 0).plus(
          cardOverdue,
        ),
      ),
      totalCardUsed: money(
        cardUsage.reduce(
          (total, item) => total.plus(item.used),
          new Prisma.Decimal(0),
        ),
      ),
      investedTotal: money(investedTotal),
      inactiveAccountsBalance: money(inactiveBalance),
      netWorth: money(netWorth),
    },
    accounts: accounts.map((item) => ({
      ...item,
      currentBalance: money(item.currentBalance),
      pendingCommitments: money(commitmentsByAccount.get(item.id)),
      projectedBalance: money(
        new Prisma.Decimal(item.currentBalance).minus(
          commitmentsByAccount.get(item.id) ?? 0,
        ),
      ),
    })),
    categoryExpenses: [...periodTotals.categories.entries()]
      .map(([name, amount]) => ({ name, amount: money(amount) }))
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 6),
    expenseBreakdown,
    monthlySeries: seriesRanges.map((seriesRange, index) => ({
      month: `${seriesRange.year}-${String(seriesRange.month).padStart(2, "0")}`,
      label: `${String(seriesRange.month).padStart(2, "0")}/${seriesRange.year}`,
      income: money(seriesTotals[index].income),
      expense: money(seriesTotals[index].expense),
    })),
    cards: cardUsage,
    nextInvoice: upcomingInvoices[0]
      ? {
          id: upcomingInvoices[0].id,
          cardName: upcomingInvoices[0].creditCard.name,
          dueDate: upcomingInvoices[0].dueDate,
          amount: money(upcomingInvoices[0].totalAmount),
        }
      : null,
  };
}
