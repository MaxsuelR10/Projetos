import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeCategoryRulePattern } from "../utils/normalize-category-rule.js";

const D = (value) => new Prisma.Decimal(value);
function localDate(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  return ["year", "month", "day"].map((key) => parts.find((part) => part.type === key).value).join("-");
}
function settlementDate(value) {
  // Date-only inputs are stored at UTC midnight; actual timestamps use the user's business timezone.
  return value.toISOString().endsWith("T00:00:00.000Z") ? value.toISOString().slice(0, 10) : localDate(value);
}
function nextMonth(month) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
}
function publicReview(review, hash) {
  return {
    id: review.id, month: review.month, createdAt: review.createdAt,
    bankBalance: review.bankBalance.toString(), closingBalance: review.closingBalance.toString(),
    difference: review.difference.toString(), justification: review.justification,
    stale: review.snapshotHash !== hash, snapshot: review.snapshot,
  };
}

async function calculate(db, userId, { accountId, month, bankBalance }) {
  const account = await db.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new AppError("Conta não encontrada", 404, "ACCOUNT_NOT_FOUND");
  const [transactions, transfers, adjustments, pending] = await Promise.all([
    db.transaction.findMany({
      where: {
        userId, accountId, status: "COMPLETED", cardPurchaseId: null,
        OR: [{ paymentMethod: null }, { paymentMethod: { not: "CREDIT_CARD" } }],
      },
      include: { category: { select: { name: true } } },
    }),
    db.transfer.findMany({
      where: { userId, isReversed: false, OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] },
      include: { fromAccount: { select: { name: true } }, toAccount: { select: { name: true } } },
    }),
    db.accountBalanceAdjustment.findMany({ where: { userId, accountId } }),
    db.transaction.findMany({
      where: { userId, accountId, status: { in: ["PENDING", "OVERDUE"] } },
      select: { id: true, description: true, amount: true, date: true, dueDate: true },
    }),
  ]);
  const events = [
    ...transactions.map((item) => ({
      id: item.id, kind: item.creditCardInvoiceId ? "INVOICE" : item.type,
      date: settlementDate(item.settledAt || item.date), description: item.description,
      amount: item.type === "INCOME" ? item.amount.toString() : item.amount.negated().toString(),
      category: item.category.name, categoryId: item.categoryId,
      legacyDate: !item.settledAt, transactionId: item.id,
    })),
    ...transfers.map((item) => ({
      id: item.id, kind: item.toAccountId === accountId ? "TRANSFER_IN" : "TRANSFER_OUT",
      date: item.date.toISOString().slice(0, 10),
      description: item.description || (item.toAccountId === accountId ? "De " + item.fromAccount.name : "Para " + item.toAccount.name),
      amount: item.toAccountId === accountId ? item.amount.toString() : item.amount.negated().toString(),
      transferId: item.id,
    })),
    ...adjustments.map((item) => ({
      id: item.id, kind: "ADJUSTMENT", date: localDate(item.createdAt),
      description: "Ajuste manual de saldo", amount: item.difference.toString(),
      previousBalance: item.previousBalance.toString(), newBalance: item.newBalance.toString(),
    })),
  ].sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));

  const start = month + "-01";
  const end = nextMonth(month);
  const prior = events.filter((item) => item.date < start);
  const period = events.filter((item) => item.date >= start && item.date < end);
  const through = events.filter((item) => item.date < end);
  const sum = (items) => items.reduce((value, item) => value.plus(item.amount), D(0));
  const opening = D(account.initialBalance).plus(sum(prior));
  const closing = opening.plus(sum(period));
  const computedCurrent = D(account.initialBalance).plus(sum(events));
  const unexplainedBalance = D(account.currentBalance).minus(computedCurrent);
  const totals = {
    opening: opening.toString(), closing: closing.toString(),
    income: sum(period.filter((item) => item.kind === "INCOME")).toString(),
    expense: sum(period.filter((item) => item.kind === "EXPENSE")).abs().toString(),
    transferIn: sum(period.filter((item) => item.kind === "TRANSFER_IN")).toString(),
    transferOut: sum(period.filter((item) => item.kind === "TRANSFER_OUT")).abs().toString(),
    invoicePayments: sum(period.filter((item) => item.kind === "INVOICE")).abs().toString(),
    adjustments: sum(period.filter((item) => item.kind === "ADJUSTMENT")).toString(),
  };
  const duplicateGroups = new Map();
  for (const event of period.filter((item) => item.transactionId)) {
    const key = [event.date, event.kind, event.amount, normalizeCategoryRulePattern(event.description)].join("|");
    const ids = duplicateGroups.get(key) || [];
    ids.push(event.id);
    duplicateGroups.set(key, ids);
  }
  const possibleDuplicates = [...duplicateGroups.values()].filter((ids) => ids.length > 1).flat();
  const legacyCount = through.filter((item) => item.legacyDate).length;
  const currentMonth = localDate(new Date()).slice(0, 7);
  const warnings = [];
  if (!unexplainedBalance.isZero()) warnings.push("O saldo atual não é explicado pelo saldo inicial e pelo histórico registrado. Revise os registros antes de concluir a conciliação.");
  if (legacyCount) warnings.push(legacyCount + " lançamento(s) antigo(s) sem data de liquidação: foi usada a data do lançamento.");
  const snapshotHash = createHash("sha256").update(JSON.stringify({
    accountId, month, initialBalance: account.initialBalance.toString(),
    events: through, unexplainedBalance: unexplainedBalance.toString(),
  })).digest("hex");
  const reviews = await db.accountReconciliation.findMany({
    where: { userId, accountId, month }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return {
    account: { id: account.id, name: account.name, isActive: account.isActive, initialBalance: account.initialBalance.toString() },
    month, totals, snapshotHash, warnings, legacyCount,
    unexplainedBalance: unexplainedBalance.toString(),
    periodEnded: month < currentMonth,
    canReview: month < currentMonth && unexplainedBalance.isZero(),
    bankBalance: bankBalance === undefined ? null : D(bankBalance).toString(),
    difference: bankBalance === undefined ? null : D(bankBalance).minus(closing).toString(),
    movements: period.map((item) => ({ ...item, possibleDuplicate: possibleDuplicates.includes(item.id) })),
    priorMovements: prior,
    pending: pending.filter((item) => (item.dueDate || item.date).toISOString().slice(0, 7) === month)
      .map((item) => ({ ...item, amount: item.amount.toString() })),
    reviews: reviews.map((review) => publicReview(review, snapshotHash)),
  };
}

export async function previewReconciliation(userId, data) {
  return prisma.$transaction((db) => calculate(db, userId, data), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000,
  });
}

export async function saveReconciliation(userId, data) {
  const write = async (db) => {
    const existing = await db.accountReconciliation.findUnique({
      where: { userId_requestId: { userId, requestId: data.requestId } },
    });
    if (existing) {
      if (existing.accountId !== data.accountId || existing.month !== data.month
        || existing.snapshotHash !== data.snapshotHash || !existing.bankBalance.equals(data.bankBalance)
        || (existing.justification || "") !== data.justification) {
        throw new AppError("Este identificador já foi usado em outra revisão", 409, "RECONCILIATION_REQUEST_CONFLICT");
      }
      const current = await calculate(db, userId, data);
      return { review: publicReview(existing, current.snapshotHash), idempotent: true };
    }
    const snapshot = await calculate(db, userId, data);
    if (!snapshot.periodEnded) throw new AppError("Aguarde o fim do mês para registrar a revisão", 409, "RECONCILIATION_PERIOD_OPEN");
    if (!D(snapshot.unexplainedBalance).isZero()) throw new AppError("O histórico não explica o saldo atual da conta. Revise os registros.", 409, "RECONCILIATION_HISTORY_INCOMPLETE");
    if (snapshot.snapshotHash !== data.snapshotHash) throw new AppError("Os movimentos mudaram. Atualize a conferência antes de salvar.", 409, "RECONCILIATION_SNAPSHOT_CHANGED");
    if ((!D(snapshot.difference).isZero() || snapshot.legacyCount) && data.justification.length < 5) {
      throw new AppError("Informe uma justificativa para a diferença ou para as datas antigas estimadas", 400, "RECONCILIATION_JUSTIFICATION_REQUIRED");
    }
    const review = await db.accountReconciliation.create({
      data: {
        userId, accountId: data.accountId, month: data.month, requestId: data.requestId,
        snapshotHash: snapshot.snapshotHash, bankBalance: data.bankBalance,
        closingBalance: snapshot.totals.closing, difference: snapshot.difference,
        justification: data.justification || null,
        snapshot: { totals: snapshot.totals, movements: snapshot.movements, priorMovements: snapshot.priorMovements },
      },
    });
    return { review: publicReview(review, snapshot.snapshotHash), idempotent: false };
  };
  try {
    return await prisma.$transaction(write, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  } catch (error) {
    if (["P2002", "P2034"].includes(error?.code)) {
      throw new AppError("Outra operação ocorreu durante a revisão. Tente novamente com o mesmo identificador.", 409, "RECONCILIATION_RETRY");
    }
    throw error;
  }
}
