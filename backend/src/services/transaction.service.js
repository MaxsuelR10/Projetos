import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { cancelPurchaseInTransaction, createPurchaseInTransaction } from "./card.service.js";

const relationSelect = {
  account: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, color: true, type: true } },
  subcategory: { select: { id: true, name: true, color: true } },
  creditCard: { select: { id: true, name: true, color: true } },
};

function asDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function nullable(value) {
  return value?.trim() || null;
}

function serializeTransaction(transaction) {
  const { userId: _userId, ...publicTransaction } = transaction;
  return { ...publicTransaction, amount: transaction.amount.toString() };
}

function affectsBalance(status, paymentMethod) {
  return status === "COMPLETED" && paymentMethod !== "CREDIT_CARD";
}

async function findActiveAccount(db, userId, id) {
  const account = await db.account.findFirst({ where: { id, userId, isActive: true } });
  if (!account) throw new AppError("Conta ativa n\u00e3o encontrada", 404, "ACCOUNT_NOT_FOUND");
  return account;
}

async function validateClassification(db, userId, data) {
  const category = await db.category.findFirst({ where: { id: data.categoryId, userId, isActive: true } });
  if (!category) throw new AppError("Categoria ativa n\u00e3o encontrada", 404, "CATEGORY_NOT_FOUND");
  if (category.type !== data.type) throw new AppError("A categoria deve ter o mesmo tipo do lan\u00e7amento", 400, "CATEGORY_TYPE_MISMATCH");

  if (!data.subcategoryId) return;
  const subcategory = await db.subcategory.findFirst({
    where: { id: data.subcategoryId, categoryId: category.id, userId, isActive: true },
  });
  if (!subcategory) throw new AppError("Subcategoria ativa n\u00e3o encontrada para esta categoria", 400, "SUBCATEGORY_NOT_FOUND");
}

async function applyBalance(db, accountId, type, amount, direction = 1) {
  const shouldIncrease = (type === "INCOME" ? 1 : -1) * direction === 1;
  await db.account.update({
    where: { id: accountId },
    data: { currentBalance: shouldIncrease ? { increment: amount } : { decrement: amount } },
  });
}

export async function listTransactions(userId, filters) {
  const where = {
    userId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...((filters.from || filters.to) ? { date: { ...(filters.from ? { gte: asDate(filters.from) } : {}), ...(filters.to ? { lte: asDate(filters.to) } : {}) } } : {}),
  };
  const [transactions, total] = await prisma.$transaction([
    prisma.transaction.findMany({ where, include: relationSelect, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (filters.page - 1) * filters.limit, take: filters.limit }),
    prisma.transaction.count({ where }),
  ]);
  return { transactions: transactions.map(serializeTransaction), pagination: { page: filters.page, limit: filters.limit, total } };
}

export async function createTransaction(userId, data) {
  const transaction = await prisma.$transaction(async (db) => {
    await findActiveAccount(db, userId, data.accountId);
    await validateClassification(db, userId, data);
    const isCardPurchase = data.paymentMethod === "CREDIT_CARD";
    const status = isCardPurchase ? "COMPLETED" : (data.status ?? "PENDING");
    const purchase = isCardPurchase ? await createPurchaseInTransaction(db, userId, data.creditCardId, {
      categoryId: data.categoryId, subcategoryId: data.subcategoryId, description: data.description,
      totalAmount: data.amount, purchaseDate: data.date, installmentsCount: 1, notes: data.notes,
    }) : null;
    const created = await db.transaction.create({
      data: {
        userId, accountId: data.accountId, categoryId: data.categoryId, subcategoryId: data.subcategoryId || null,
        type: data.type, description: data.description, amount: data.amount, date: asDate(data.date),
        dueDate: data.dueDate ? asDate(data.dueDate) : null, status, paymentMethod: data.paymentMethod || null,
        notes: nullable(data.notes), creditCardId: isCardPurchase ? data.creditCardId : null,
        cardPurchaseId: purchase?.id || null, settledAt: affectsBalance(status, data.paymentMethod) ? new Date() : null,
      }, include: relationSelect,
    });
    if (affectsBalance(status, data.paymentMethod)) await applyBalance(db, data.accountId, data.type, data.amount);
    return created;
  });
  return serializeTransaction(transaction);
}

export async function updateTransaction(userId, id, data) {
  const transaction = await prisma.$transaction(async (db) => {
    const existing = await db.transaction.findFirst({ where: { id, userId } });
    if (!existing) throw new AppError("Lan\u00e7amento n\u00e3o encontrado", 404, "TRANSACTION_NOT_FOUND");
    if (existing.status === "CANCELLED") throw new AppError("Um lan\u00e7amento cancelado n\u00e3o pode ser alterado", 409, "TRANSACTION_CANCELLED");

    const next = {
      accountId: data.accountId ?? existing.accountId,
      categoryId: data.categoryId ?? existing.categoryId,
      subcategoryId: data.subcategoryId === undefined ? existing.subcategoryId : data.subcategoryId,
      type: data.type ?? existing.type,
      amount: data.amount ?? existing.amount.toString(),
      status: data.status ?? existing.status,
    };
    await findActiveAccount(db, userId, next.accountId);
    await validateClassification(db, userId, next);

    if (existing.cardPurchaseId && (data.paymentMethod !== undefined || data.creditCardId !== undefined || data.amount !== undefined || data.date !== undefined || data.categoryId !== undefined || data.subcategoryId !== undefined)) throw new AppError("Edite compras de cartao na tela de Cartoes", 409, "CARD_PURCHASE_EDIT_PROTECTED");
    if (affectsBalance(existing.status, existing.paymentMethod)) await applyBalance(db, existing.accountId, existing.type, existing.amount.toString(), -1);
    const updated = await db.transaction.update({
      where: { id: existing.id },
      data: {
        ...(data.accountId !== undefined ? { accountId: data.accountId } : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.subcategoryId !== undefined ? { subcategoryId: data.subcategoryId } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.date !== undefined ? { date: asDate(data.date) } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? asDate(data.dueDate) : null } : {}),
        ...(data.status !== undefined ? { status: data.status, settledAt: affectsBalance(next.status, data.paymentMethod ?? existing.paymentMethod) ? (existing.settledAt || new Date()) : null } : {}),
        ...(data.paymentMethod !== undefined ? { paymentMethod: data.paymentMethod || null } : {}),
        ...(data.notes !== undefined ? { notes: nullable(data.notes) } : {}),
      }, include: relationSelect,
    });
    if (affectsBalance(next.status, data.paymentMethod ?? existing.paymentMethod)) await applyBalance(db, next.accountId, next.type, next.amount);
    return updated;
  });
  return serializeTransaction(transaction);
}

export async function cancelTransaction(userId, id) {
  await prisma.$transaction(async (db) => {
    const existing = await db.transaction.findFirst({ where: { id, userId } });
    if (!existing) throw new AppError("Lan\u00e7amento n\u00e3o encontrado", 404, "TRANSACTION_NOT_FOUND");
    if (existing.status === "CANCELLED") return;
    if (existing.cardPurchaseId) await cancelPurchaseInTransaction(db, userId, existing.cardPurchaseId);
    if (affectsBalance(existing.status, existing.paymentMethod)) await applyBalance(db, existing.accountId, existing.type, existing.amount.toString(), -1);
    await db.transaction.update({ where: { id }, data: { status: "CANCELLED", settledAt: null } });
  });
}

export async function deleteTransaction(userId, id) {
  await prisma.$transaction(async (db) => {
    const existing = await db.transaction.findFirst({ where: { id, userId } });
    if (!existing) throw new AppError("Lançamento não encontrado", 404, "TRANSACTION_NOT_FOUND");
    if (existing.creditCardInvoiceId) {
      throw new AppError("O pagamento de uma fatura não pode ser excluído por esta tela", 409, "INVOICE_PAYMENT_PROTECTED");
    }
    if (existing.cardPurchaseId) await cancelPurchaseInTransaction(db, userId, existing.cardPurchaseId);
    if (affectsBalance(existing.status, existing.paymentMethod)) {
      await applyBalance(db, existing.accountId, existing.type, existing.amount.toString(), -1);
    }
    await db.transaction.delete({ where: { id: existing.id } });
  });
}
