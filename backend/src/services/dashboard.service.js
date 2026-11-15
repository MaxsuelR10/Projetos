import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import {
  brazilianDate,
  monthBounds,
  transactionCompetenceFilter,
} from "../utils/financial-competence.js";
import { listBudgets } from "./planning.service.js";
import { effectiveInvoiceStatus, invoiceBalance } from "./card.service.js";

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
      ...(cardId ? { creditCardInvoice: { creditCardId: cardId } } : {}),
    },
    select: { type: true, amount: true },
  });

  let income = new Prisma.Decimal(0);
  let expense = new Prisma.Decimal(0);
  for (const transaction of transactions) {
    if (transaction.type === "INCOME") income = income.plus(transaction.amount);
    else expense = expense.plus(transaction.amount);
  }
  return { income, expense };
}

function dateRange(from, to) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function startOfToday() {
  return new Date(`${brazilianDate()}T00:00:00.000Z`);
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
      where: { userId, status: { not: "PAID" }, totalAmount: { gt: prisma.creditCardInvoice.fields.paidAmount }, dueDate: { lte: through } },
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
    (total, item) => total.plus(invoiceBalance(item)),
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
      amount: invoiceBalance(item),
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
        description: `${money(invoiceBalance(item))} com vencimento em ${isoDate(item.dueDate)}.`,
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
    cardId ? Promise.resolve([]) : prisma.transaction.findMany({
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
        ...(cardId ? { creditCardId: cardId } : {}), status: { not: "CANCELLED" }, purchase: { status: "ACTIVE" },
        invoice: {
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
  const today = startOfToday();
  const currentMonth = isoDate(today).slice(0, 7);
  const startMonth = query.startMonth ?? query.month ?? query.startDate?.slice(0, 7) ?? currentMonth;
  const endMonth = query.endMonth ?? query.endDate?.slice(0, 7) ?? startMonth;
  const months = query.months ?? 6;
  const startRange = monthBounds(startMonth);
  const endRange = monthBounds(endMonth);
  const rangeStart = cardId ? startRange.start.toISOString().slice(0, 10) : query.startDate ?? startRange.start.toISOString().slice(0, 10);
  const rangeEnd = cardId ? new Date(endRange.end.getTime() - 86_400_000).toISOString().slice(0, 10) : query.endDate ?? new Date(endRange.end.getTime() - 86_400_000).toISOString().slice(0, 10);
  const range = dateRange(rangeStart, rangeEnd);
  const expenseFrom = cardId ? rangeStart : query.expenseFrom ?? rangeStart;
  const expenseTo = cardId ? rangeEnd : query.expenseTo ?? rangeEnd;
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
    cards,
    payableInvoices,
    expenseBreakdown,
    selectedCategories,
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
    prisma.creditCard.findMany({
      where: { userId, type: "CREDIT", ...(cardId ? { id: cardId } : { isActive: true }) },
      select: { id: true, name: true, creditLimit: true },
    }),
    prisma.creditCardInvoice.findMany({
      where: {
        userId,
        ...(cardId ? { creditCardId: cardId } : {}),
        status: { not: "PAID" },
        totalAmount: { gt: prisma.creditCardInvoice.fields.paidAmount },
        OR: [
          { dueDate: { gte: range.start, lt: range.end } },
          { dueDate: { lt: today < range.start ? today : range.start } },
        ],
      },
      orderBy: [{ dueDate: "asc" }, { creditCardId: "asc" }],
      include: { creditCard: { select: { name: true } } },
    }),
    getExpenseBreakdown(userId, expenseRange, cardId),
    expenseFrom === rangeStart && expenseTo === rangeEnd ? null : getExpenseBreakdown(userId, range, cardId),
  ]);

  const [seriesTotals, cardUsage, commitments, overdueTransactions, movementCount] =
    await Promise.all([
      Promise.all(
        seriesRanges.map(async (seriesRange) => {
          if (!cardId) return getCashPeriodTotals(userId, seriesRange);
          const total = await prisma.cardInstallment.aggregate({ where: { userId, creditCardId: cardId, status: { not: "CANCELLED" }, purchase: { status: "ACTIVE" }, invoice: { dueDate: { gte: seriesRange.start, lt: seriesRange.end } } }, _sum: { amount: true } });
          return { income: new Prisma.Decimal(0), expense: total._sum.amount || new Prisma.Decimal(0) };
        }),
      ),
      Promise.all(
        cards.map(async (card) => {
          const total = await prisma.creditCardInvoice.aggregate({
            where: { userId, creditCardId: card.id, status: { not: "PAID" } },
            _sum: { totalAmount: true, paidAmount: true },
          });
          const used = new Prisma.Decimal(total._sum.totalAmount ?? 0).minus(total._sum.paidAmount ?? 0);
          return {
            name: card.name,
            used: money(used),
            available: Prisma.Decimal.max(0, new Prisma.Decimal(card.creditLimit).minus(used)).toString(),
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

  const inPeriod = payableInvoices.filter((item) => item.dueDate >= range.start);
  const priorOverdue = payableInvoices.filter((item) => item.dueDate < range.start);
  const sumInvoices = (items) => items.reduce((total, item) => total.plus(invoiceBalance(item)), new Prisma.Decimal(0));
  const cardPending = sumInvoices(inPeriod);
  const cardOverdue = sumInvoices(inPeriod.filter((item) => item.dueDate < today));
  const publicInvoice = (invoice) => ({
    id: invoice.id, cardId: invoice.creditCardId, cardName: invoice.creditCard.name,
    month: isoDate(invoice.dueDate).slice(0, 7), dueDate: invoice.dueDate,
    status: effectiveInvoiceStatus(invoice, today), amount: money(invoiceBalance(invoice)),
  });
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
      invoiceTotal: money(cardPending),
      overdueInvoiceTotal: money(sumInvoices(priorOverdue)),
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
    categoryExpenses: (selectedCategories ?? expenseBreakdown).slice(0, 6),
    expenseBreakdown,
    monthlySeries: seriesRanges.map((seriesRange, index) => ({
      month: `${seriesRange.year}-${String(seriesRange.month).padStart(2, "0")}`,
      label: `${String(seriesRange.month).padStart(2, "0")}/${seriesRange.year}`,
      income: money(seriesTotals[index].income),
      expense: money(seriesTotals[index].expense),
    })),
    cards: cardUsage,
    pendingInvoices: inPeriod.map(publicInvoice),
    overdueInvoices: priorOverdue.map(publicInvoice),
    nextInvoice: inPeriod[0]
      ? {
          id: inPeriod[0].id,
          cardName: inPeriod[0].creditCard.name,
          dueDate: inPeriod[0].dueDate,
          amount: money(invoiceBalance(inPeriod[0])),
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
