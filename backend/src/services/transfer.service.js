import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";

function asDate(value) { return new Date(`${value}T00:00:00.000Z`); }
function nullable(value) { return value?.trim() || null; }
const accountSelect = { select: { id: true, name: true, color: true } };

function serializeTransfer(transfer) {
  const { userId: _userId, ...publicTransfer } = transfer;
  return { ...publicTransfer, amount: transfer.amount.toString() };
}

async function findActiveAccount(db, userId, id) {
  const account = await db.account.findFirst({ where: { id, userId, isActive: true } });
  if (!account) throw new AppError("Conta ativa n\u00e3o encontrada", 404, "ACCOUNT_NOT_FOUND");
  return account;
}

export async function listTransfers(userId, filters) {
  const transfers = await prisma.transfer.findMany({
    where: {
      userId,
      ...(filters.accountId ? { OR: [{ fromAccountId: filters.accountId }, { toAccountId: filters.accountId }] } : {}),
      ...(filters.includeReversed === "true" ? {} : { isReversed: false }),
      ...((filters.from || filters.to) ? { date: { ...(filters.from ? { gte: asDate(filters.from) } : {}), ...(filters.to ? { lte: asDate(filters.to) } : {}) } } : {}),
    }, include: { fromAccount: accountSelect, toAccount: accountSelect }, orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return transfers.map(serializeTransfer);
}

export async function createTransfer(userId, data) {
  try {
    const transfer = await prisma.$transaction(async (db) => {
      if (data.idempotencyKey) {
        const previous = await db.transfer.findFirst({ where: { userId, idempotencyKey: data.idempotencyKey }, include: { fromAccount: accountSelect, toAccount: accountSelect } });
        if (previous) return { transfer: previous, idempotent: true };
      }
      await findActiveAccount(db, userId, data.fromAccountId);
      await findActiveAccount(db, userId, data.toAccountId);
      await db.account.update({ where: { id: data.fromAccountId }, data: { currentBalance: { decrement: data.amount } } });
      await db.account.update({ where: { id: data.toAccountId }, data: { currentBalance: { increment: data.amount } } });
      const created = await db.transfer.create({
        data: { userId, fromAccountId: data.fromAccountId, toAccountId: data.toAccountId, amount: data.amount, date: asDate(data.date), description: nullable(data.description), idempotencyKey: data.idempotencyKey || null },
        include: { fromAccount: accountSelect, toAccount: accountSelect },
      });
      return { transfer: created, idempotent: false };
    });
    return { ...transfer, transfer: serializeTransfer(transfer.transfer) };
  } catch (error) {
    if (error?.code === "P2002" && data.idempotencyKey) {
      const existing = await prisma.transfer.findFirst({ where: { userId, idempotencyKey: data.idempotencyKey }, include: { fromAccount: accountSelect, toAccount: accountSelect } });
      if (existing) return { transfer: serializeTransfer(existing), idempotent: true };
    }
    throw error;
  }
}

export async function reverseTransfer(userId, id) {
  const transfer = await prisma.$transaction(async (db) => {
    const existing = await db.transfer.findFirst({ where: { id, userId } });
    if (!existing) throw new AppError("Transfer\u00eancia n\u00e3o encontrada", 404, "TRANSFER_NOT_FOUND");
    if (existing.isReversed) return existing;
    await db.account.update({ where: { id: existing.fromAccountId }, data: { currentBalance: { increment: existing.amount } } });
    await db.account.update({ where: { id: existing.toAccountId }, data: { currentBalance: { decrement: existing.amount } } });
    return db.transfer.update({ where: { id }, data: { isReversed: true, reversedAt: new Date() } });
  });
  return serializeTransfer(transfer);
}
