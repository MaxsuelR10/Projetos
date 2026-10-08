import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import {
  monthBounds,
  transactionCompetenceFilter,
} from "../utils/financial-competence.js";
import { listBudgets } from "./planning.service.js";

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

async function getCashPeriodTotals(userId, range, cardId) {
  const transactions = await prisma.transaction.findMany({
    where: {
      ...cashPeriodTransactions(userId, range),
      ...(cardId ? {
        type: "EXPENSE",
        AND: [{ OR: [
          { creditCardInvoice: { is: { creditCardId: cardId } } },
          { creditCardId: cardId, creditCardInvoiceId: null },
        ] }],
      } : {}),
    },
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

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addUtcDays(date, amount) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function agendaStatus(date, today) {
  if (date < today) return "OVERDUE";
  if (date.getTime() === today.getTime()) return "TODAY";
  return "UPCOMING";
}

function agendaItem({ id, type, title, subtitle, amount = null, dueDate, path, today }) {
  return {
    id: `${type}:${id}`,
    type,
    title,
    subtitle,
    amount: amount === null ? null : money(amount),
    dueDate: isoDate(dueDate),
    status: agendaStatus(dueDate, today),
    path,
  };
}

async function getForwardView(userId, balance) {
  const today = startOfToday();
  const through = addUtcDays(today, 30);
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;

  const [
    transactions,
    invoices,
    recurrences,
    subscriptions,
    reminders,
    goals,
    budgets,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        type: "EXPENSE",
        status: { in: ["PENDING", "OVERDUE"] },
        cardPurchaseId: null,
        creditCardInvoiceId: null,
        dueDate: { not: null, lte: through },
      },
      orderBy: { dueDate: "asc" },
      include: { category: { select: { name: true } } },
    }),
    prisma.creditCardInvoice.findMany({
      where: { userId, status: { not: "PAID" }, dueDate: { lte: through } },
      orderBy: { dueDate: "asc" },
      include: { creditCard: { select: { name: true } } },
    }),
    prisma.recurringTransaction.findMany({
      where: { userId, status: "ACTIVE", nextOccurrenceDate: { lte: through } },
      orderBy: { nextOccurrenceDate: "asc" },
      include: { account: { select: { name: true } } },
    }),
    prisma.subscription.findMany({
      where: { userId, isActive: true, nextBillingDate: { lte: through } },
      orderBy: { nextBillingDate: "asc" },
    }),
    prisma.paymentReminder.findMany({
      where: { userId, isDone: false, dueDate: { not: null, lte: through } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.financialGoal.findMany({
      where: { userId, status: "ACTIVE", deadline: { not: null, lte: through } },
      orderBy: { deadline: "asc" },
    }),
    listBudgets(userId, currentYear, currentMonth),
  ]);

  const transactionCommitments = transactions.reduce(
    (total, item) => total.plus(item.amount),
    new Prisma.Decimal(0),
  );
  const invoiceCommitments = invoices.reduce(
    (total, item) => total.plus(item.totalAmount),
    new Prisma.Decimal(0),
  );
  const futureCommitments = transactionCommitments.plus(invoiceCommitments);
  const freeBalanceProjected = balance.minus(futureCommitments);
  const monthEnd = new Date(Date.UTC(currentYear, currentMonth, 0));

  const agenda = [
    ...transactions.map((item) => agendaItem({
      id: item.id,
      type: "TRANSACTION",
      title: item.description,
      subtitle: item.category.name,
      amount: item.amount,
      dueDate: item.dueDate,
      path: "/movimentacoes",
      today,
    })),
    ...invoices.map((item) => agendaItem({
      id: item.id,
      type: "INVOICE",
      title: `Fatura ${item.creditCard.name}`,
      subtitle: "Cartão de crédito",
      amount: item.totalAmount,
      dueDate: item.dueDate,
      path: "/cartoes",
      today,
    })),
    ...recurrences.map((item) => agendaItem({
      id: item.id,
      type: "RECURRENCE",
      title: item.description,
      subtitle: `Recorrência · ${item.account.name}`,
      amount: item.amount,
      dueDate: item.nextOccurrenceDate,
      path: "/recorrencias",
      today,
    })),
    ...subscriptions.map((item) => agendaItem({
      id: item.id,
      type: "SUBSCRIPTION",
      title: item.serviceName,
      subtitle: "Assinatura",
      amount: item.amount,
      dueDate: item.nextBillingDate,
      path: "/recorrencias",
      today,
    })),
    ...reminders.map((item) => agendaItem({
      id: item.id,
      type: "REMINDER",
      title: item.title,
      subtitle: "Lembrete de pagamento",
      amount: item.amount,
      dueDate: item.dueDate,
      path: "/desejos",
      today,
    })),
    ...goals.map((item) => agendaItem({
      id: item.id,
      type: "GOAL",
      title: item.name,
      subtitle: "Prazo de meta financeira",
      amount: new Prisma.Decimal(item.targetAmount).minus(item.currentAmount),
      dueDate: item.deadline,
      path: "/planejamento",
      today,
    })),
    ...budgets
      .filter((item) => item.percent >= 80)
      .map((item) => agendaItem({
        id: item.id,
        type: "BUDGET",
        title: `Orçamento de ${item.category.name}`,
        subtitle: `${Math.round(item.percent)}% utilizado no mês`,
        amount: item.limitAmount,
        dueDate: monthEnd,
        path: "/planejamento",
        today,
      })),
  ].sort((first, second) => first.dueDate.localeCompare(second.dueDate));

  const alerts = [
    ...budgets
      .filter((item) => item.percent >= 80)
      .map((item) => ({
        id: `BUDGET:${item.id}`,
        type: "BUDGET",
        severity: item.percent >= 100 ? "danger" : "warning",
        title: item.percent >= 100
          ? `Orçamento de ${item.category.name} ultrapassado`
          : `Orçamento de ${item.category.name} em ${Math.round(item.percent)}%`,
        description: `${money(item.usedAmount)} de ${money(item.limitAmount)} utilizados neste mês.`,
        path: "/planejamento",
      })),
    ...invoices
      .filter((item) => item.dueDate <= addUtcDays(today, 7))
      .map((item) => ({
        id: `INVOICE:${item.id}`,
        type: "INVOICE",
        severity: item.dueDate < today ? "danger" : "warning",
        title: item.dueDate < today
          ? `Fatura ${item.creditCard.name} vencida`
          : `Fatura ${item.creditCard.name} vence em breve`,
        description: `${money(item.totalAmount)} com vencimento em ${isoDate(item.dueDate)}.`,
        path: "/cartoes",
      })),
    ...recurrences
      .filter((item) => item.nextOccurrenceDate <= today)
      .map((item) => ({
        id: `RECURRENCE:${item.id}`,
        type: "RECURRENCE",
        severity: "warning",
        title: "Recorrência aguardando geração",
        description: `${item.description} está prevista para ${isoDate(item.nextOccurrenceDate)}.`,
        path: "/recorrencias",
      })),
    ...(freeBalanceProjected.isNegative()
      ? [{
          id: "BALANCE:NEGATIVE",
          type: "BALANCE",
          severity: "danger",
          title: "Saldo projetado negativo",
          description: `Os compromissos dos próximos 30 dias superam o saldo atual em ${money(freeBalanceProjected.abs())}.`,
          path: "/contas",
        }]
      : []),
  ];

  return {
    today: isoDate(today),
    through: isoDate(through),
    futureCommitments: money(futureCommitments),
    freeBalanceProjected: money(freeBalanceProjected),
    agenda,
    alerts,
  };
}

async function getExpenseBreakdown(userId, range, cardId) {
  const [cashExpenses, cardInstallments] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        ...cashPeriodTransactions(userId, range),
        type: "EXPENSE",
        creditCardInvoiceId: null,
        ...(cardId ? { creditCardId: cardId } : {}),
      },
      include: { category: { select: { name: true } } },
    }),
    prisma.cardInstallment.findMany({
      where: {
        userId,
        ...(cardId ? { creditCardId: cardId, status: { not: "CANCELLED" }, purchase: { status: "ACTIVE" } } : { status: "PENDING" }),
        invoice: {
          ...(cardId ? {} : { status: { not: "PAID" } }),
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
  const cardId = query.cardId;
  if (cardId) {
    const card = await prisma.creditCard.findFirst({ where: { id: cardId, userId }, select: { id: true } });
    if (!card) throw new AppError("Cartão não encontrado", 404, "CARD_NOT_FOUND");
  }
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
    allPeriodTotals,
    accounts,
    inactiveAccounts,
    investmentsAggregate,
    pending,
    pendingCardInstallments,
    cards,
    upcomingInvoices,
    expenseBreakdown,
  ] = await Promise.all([
    getCashPeriodTotals(userId, range, cardId),
    cardId ? getCashPeriodTotals(userId, range) : null,
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
      where: { ...pendingPeriodTransactions(userId, range), ...(cardId ? { creditCardId: cardId } : {}) },
      _sum: { amount: true },
    }),
    prisma.cardInstallment.findMany({
      where: {
        userId,
        ...(cardId ? { creditCardId: cardId } : {}),
        status: "PENDING",
        invoice: {
          dueDate: { gte: range.start, lt: range.end },
          status: { not: "PAID" },
        },
      },
      select: { amount: true, dueDate: true },
    }),
    prisma.creditCard.findMany({
      where: { userId, type: "CREDIT", ...(cardId ? { id: cardId } : { isActive: true }) },
      select: { id: true, name: true, creditLimit: true },
    }),
    prisma.creditCardInvoice.findMany({
      where: {
        userId,
        ...(cardId ? { creditCardId: cardId } : {}),
        status: { not: "PAID" },
        dueDate: { gte: range.start, lt: range.end },
      },
      orderBy: { dueDate: "asc" },
      take: 1,
      include: { creditCard: { select: { name: true } } },
    }),
    getExpenseBreakdown(userId, expenseRange, cardId),
  ]);

  const [seriesTotals, cardUsage, commitments, overdueTransactions, movementCount] =
    await Promise.all([
      Promise.all(
        seriesRanges.map((seriesRange) => getCashPeriodTotals(userId, seriesRange, cardId)),
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
          ...(cardId ? { creditCardId: cardId } : {}),
        },
        _sum: { amount: true },
      }),
      prisma.transaction.count({ where: { userId, status: { not: "CANCELLED" } } }),
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
  const forwardView = await getForwardView(userId, balance);

  // Cash-basis result: money actually received minus money actually paid in the period.
  const monthlyResult = cardId ? periodTotals.expense.negated() : periodTotals.income.minus(periodTotals.expense);

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
      paidExpenses: money(periodTotals.expense),
      futureCommitments: forwardView.futureCommitments,
      freeBalanceProjected: forwardView.freeBalanceProjected,
      projectedBalance: money(projectedBalance),
      monthlyIncome: money(allPeriodTotals?.income ?? periodTotals.income),
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
    agenda: {
      today: forwardView.today,
      through: forwardView.through,
      items: forwardView.agenda,
    },
    alerts: forwardView.alerts,
    onboarding: {
      hasAccount: accounts.length > 0,
      hasInitialBalance: accounts.length > 0,
      hasMovement: movementCount > 0,
      hasCard: cards.length > 0,
    },
  };
}
