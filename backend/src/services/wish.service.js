import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeName } from "../utils/normalize-name.js";

function asDate(value) { return new Date(`${value}T00:00:00.000Z`); }
function serializeWish(item) { return { ...item, amount: item.amount.toString() }; }
function serializeReminder(item) { return { ...item, amount: item.amount?.toString() ?? null }; }

export async function listWishes(userId) {
  const items = await prisma.wishItem.findMany({ where: { userId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  return items.map(serializeWish);
}

export async function createWish(userId, data) {
  const item = await prisma.wishItem.create({ data: { userId, name: data.name, normalizedName: normalizeName(data.name), amount: data.amount, url: data.url || null, notes: data.notes || null } });
  return serializeWish(item);
}

export async function updateWishStatus(userId, id, status) {
  const result = await prisma.wishItem.updateMany({ where: { id, userId }, data: { status } });
  if (!result.count) throw new AppError("Item da lista de desejos não encontrado", 404, "WISH_NOT_FOUND");
  return serializeWish(await prisma.wishItem.findFirstOrThrow({ where: { id, userId } }));
}

export async function deleteWish(userId, id) {
  const result = await prisma.wishItem.deleteMany({ where: { id, userId } });
  if (!result.count) throw new AppError("Item da lista de desejos não encontrado", 404, "WISH_NOT_FOUND");
}

export async function listReminders(userId) {
  const items = await prisma.paymentReminder.findMany({ where: { userId }, orderBy: [{ isDone: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }] });
  return items.map(serializeReminder);
}

export async function createReminder(userId, data) {
  const item = await prisma.paymentReminder.create({ data: { userId, title: data.title, dueDate: data.dueDate ? asDate(data.dueDate) : null, amount: data.amount ?? null, notes: data.notes || null } });
  return serializeReminder(item);
}

export async function updateReminderDone(userId, id, isDone) {
  const result = await prisma.paymentReminder.updateMany({ where: { id, userId }, data: { isDone } });
  if (!result.count) throw new AppError("Lembrete não encontrado", 404, "REMINDER_NOT_FOUND");
  return serializeReminder(await prisma.paymentReminder.findFirstOrThrow({ where: { id, userId } }));
}

export async function deleteReminder(userId, id) {
  const result = await prisma.paymentReminder.deleteMany({ where: { id, userId } });
  if (!result.count) throw new AppError("Lembrete não encontrado", 404, "REMINDER_NOT_FOUND");
}

export async function getWishlistContext(userId, query) {
  const normalizedQuery = query ? normalizeName(query) : null;
  const [wishItems, reminders] = await Promise.all([
    prisma.wishItem.findMany({
      where: { userId, status: "ACTIVE", ...(normalizedQuery ? { normalizedName: { contains: normalizedQuery } } : {}) },
      select: { name: true, amount: true, url: true, notes: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.paymentReminder.findMany({
      where: { userId, isDone: false },
      select: { title: true, dueDate: true, amount: true, notes: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
  ]);
  const totalWishAmount = wishItems.reduce((total, item) => total.plus(item.amount), new Prisma.Decimal(0));
  return {
    query: query ?? null,
    wish_items: wishItems.map((item) => ({ name: item.name, amount: item.amount.toString(), url: item.url, notes: item.notes, added_at: item.createdAt.toISOString().slice(0, 10) })),
    pending_payment_reminders: reminders.map((item) => ({ title: item.title, due_date: item.dueDate?.toISOString().slice(0, 10) ?? null, amount: item.amount?.toString() ?? null, notes: item.notes })),
    total_wish_amount: totalWishAmount.toString(),
  };
}
