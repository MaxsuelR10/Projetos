import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeName } from "../utils/normalize-name.js";

const cardSelect = { id: true, name: true, institution: true, brand: true, type: true, creditLimit: true, closingDay: true, dueDay: true, color: true, isActive: true };
const invoiceInclude = {
  creditCard: { select: cardSelect },
  installments: {
    include: { purchase: { select: { id: true, description: true, merchant: true, installmentsCount: true, category: { select: { name: true } } } } },
    orderBy: { number: "asc" },
  },
};
function asDate(value) { return new Date(`${value}T00:00:00.000Z`); }
function nullable(value) { return value?.trim() || null; }
function serializeDecimal(value) { return value?.toString() ?? "0"; }
function dateParts(value) { const date = new Date(value); return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }; }
function addMonths(year, month, amount) { const target = new Date(Date.UTC(year, month - 1 + amount, 1)); return { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1 }; }
function dateWithDay(year, month, day) { const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay))); }
function invoiceReference(card, purchaseDate, installmentIndex = 0) {
  const parts = dateParts(purchaseDate);
  const initial = addMonths(parts.year, parts.month, parts.day <= card.closingDay ? 1 : 2);
  const reference = addMonths(initial.year, initial.month, installmentIndex);
  const closingMonth = addMonths(reference.year, reference.month, -1);
  return { ...reference, closingDate: dateWithDay(closingMonth.year, closingMonth.month, card.closingDay), dueDate: dateWithDay(reference.year, reference.month, card.dueDay) };
}
function splitMoney(amount, count) {
  const [whole, fraction = ""] = amount.split(".");
  const units = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
  const base = units / BigInt(count); const remainder = units % BigInt(count);
  return Array.from({ length: count }, (_, index) => {
    const part = base + (BigInt(index) < remainder ? 1n : 0n);
    const integer = part / 100n; const decimal = (part % 100n).toString().padStart(2, "0");
    return `${integer}.${decimal}`;
  });
}
function effectiveStatus(invoice) { return invoice.status === "OPEN" && invoice.closingDate < new Date() ? "CLOSED" : invoice.status; }
function serializeCard(card, usedLimit = "0") {
  const { userId: _userId, normalizedName: _normalizedName, ...publicCard } = card;
  const used = new Prisma.Decimal(usedLimit); const limit = new Prisma.Decimal(card.creditLimit);
  return { ...publicCard, creditLimit: serializeDecimal(card.creditLimit), usedLimit: used.toString(), availableLimit: Prisma.Decimal.max(limit.minus(used), new Prisma.Decimal(0)).toString() };
}
function serializeInvoice(invoice) {
  const { userId: _userId, ...publicInvoice } = invoice;
  return { ...publicInvoice, totalAmount: serializeDecimal(invoice.totalAmount), effectiveStatus: effectiveStatus(invoice), installments: invoice.installments?.map((item) => ({ ...item, userId: undefined, amount: serializeDecimal(item.amount) })) };
}
function serializePurchase(purchase) {
  const { userId: _userId, totalAmount, ...publicPurchase } = purchase;
  return { ...publicPurchase, totalAmount: serializeDecimal(totalAmount), installments: purchase.installments?.map((item) => ({ ...item, userId: undefined, amount: serializeDecimal(item.amount) })) };
}
async function findCard(db, userId, id, activeOnly = false) {
  const card = await db.creditCard.findFirst({ where: { id, userId, ...(activeOnly ? { isActive: true } : {}) } });
  if (!card) throw new AppError("Cartão não encontrado", 404, "CARD_NOT_FOUND");
  return card;
}
async function validateCategory(db, userId, data) {
  const category = await db.category.findFirst({ where: { id: data.categoryId, userId, type: "EXPENSE", isActive: true } });
  if (!category) throw new AppError("Categoria de despesa ativa não encontrada", 404, "CATEGORY_NOT_FOUND");
  if (data.subcategoryId) {
    const subcategory = await db.subcategory.findFirst({ where: { id: data.subcategoryId, categoryId: category.id, userId, isActive: true } });
    if (!subcategory) throw new AppError("Subcategoria não encontrada para esta categoria", 400, "SUBCATEGORY_NOT_FOUND");
  }
}
async function ensureUniqueName(userId, name, ignoredId) {
  const existing = await prisma.creditCard.findFirst({ where: { userId, normalizedName: normalizeName(name), ...(ignoredId ? { id: { not: ignoredId } } : {}) } });
  if (existing) throw new AppError("Já existe um cartão com este nome", 409, "CARD_NAME_IN_USE");
}
async function ensureInvoice(db, userId, card, reference, amount) {
  const invoice = await db.creditCardInvoice.upsert({
    where: { creditCardId_referenceYear_referenceMonth: { creditCardId: card.id, referenceYear: reference.year, referenceMonth: reference.month } },
    create: { userId, creditCardId: card.id, referenceYear: reference.year, referenceMonth: reference.month, closingDate: reference.closingDate, dueDate: reference.dueDate, totalAmount: amount },
    update: { totalAmount: { increment: amount } },
  });
  if (invoice.status === "PAID") throw new AppError("Não é possível lançar compra em uma fatura já paga", 409, "INVOICE_ALREADY_PAID");
  return invoice;
}

export async function listCards(userId, status) {
  const isActive = status === "all" ? undefined : status === "active";
  const cards = await prisma.creditCard.findMany({ where: { userId, ...(isActive === undefined ? {} : { isActive }) }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  return Promise.all(cards.map(async (card) => {
    const aggregate = await prisma.cardInstallment.aggregate({ where: { userId, creditCardId: card.id, status: "PENDING" }, _sum: { amount: true } });
    return serializeCard(card, aggregate._sum.amount?.toString() ?? "0");
  }));
}
export async function getCard(userId, id) {
  const card = await findCard(prisma, userId, id);
  const aggregate = await prisma.cardInstallment.aggregate({ where: { userId, creditCardId: id, status: "PENDING" }, _sum: { amount: true } });
  return serializeCard(card, aggregate._sum.amount?.toString() ?? "0");
}
export async function createCard(userId, data) {
  await ensureUniqueName(userId, data.name);
  const card = await prisma.creditCard.create({ data: { userId, name: data.name, normalizedName: normalizeName(data.name), institution: nullable(data.institution), brand: nullable(data.brand), type: data.type, creditLimit: data.type === "CREDIT" ? data.creditLimit : "0", closingDay: data.type === "CREDIT" ? data.closingDay : null, dueDay: data.type === "CREDIT" ? data.dueDay : null, color: data.color || null, isActive: data.isActive ?? true } });
  return serializeCard(card);
}
export async function updateCard(userId, id, data) {
  const card = await findCard(prisma, userId, id);
  if (data.name) await ensureUniqueName(userId, data.name, id);
  const nextType = data.type ?? card.type;
  const next = { creditLimit: data.creditLimit ?? card.creditLimit.toString(), closingDay: data.closingDay === undefined ? card.closingDay : data.closingDay, dueDay: data.dueDay === undefined ? card.dueDay : data.dueDay };
  if (nextType === "CREDIT" && (!next.closingDay || !next.dueDay || next.creditLimit === "0")) throw new AppError("Cartão de crédito exige limite, fechamento e vencimento", 400, "INVALID_CREDIT_CARD");
  const updated = await prisma.creditCard.update({ where: { id }, data: { ...(data.name !== undefined ? { name: data.name, normalizedName: normalizeName(data.name) } : {}), ...(data.institution !== undefined ? { institution: nullable(data.institution) } : {}), ...(data.brand !== undefined ? { brand: nullable(data.brand) } : {}), ...(data.type !== undefined ? { type: data.type } : {}), ...(data.creditLimit !== undefined ? { creditLimit: data.creditLimit } : {}), ...(data.closingDay !== undefined ? { closingDay: nextType === "CREDIT" ? data.closingDay : null } : {}), ...(data.dueDay !== undefined ? { dueDay: nextType === "CREDIT" ? data.dueDay : null } : {}), ...(data.color !== undefined ? { color: data.color || null } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}) } });
  return getCard(userId, updated.id);
}
export async function deleteCard(userId, id) {
  const card = await findCard(prisma, userId, id);
  const count = await prisma.cardPurchase.count({ where: { userId, creditCardId: card.id } });
  if (count) throw new AppError("Este cartão possui compras e só pode ser desativado", 409, "CARD_HAS_PURCHASES");
  await prisma.creditCard.delete({ where: { id: card.id } });
}

export async function createPurchaseInTransaction(db, userId, cardId, data) {
  const card = await findCard(db, userId, cardId, true);
  if (card.type !== "CREDIT") throw new AppError("CARD_NOT_CREDIT", 400, "CARD_NOT_CREDIT");
  await validateCategory(db, userId, data);
  const used = await db.cardInstallment.aggregate({ where: { userId, creditCardId: card.id, status: "PENDING" }, _sum: { amount: true } });
  if (new Prisma.Decimal(used._sum.amount ?? 0).plus(data.totalAmount).greaterThan(card.creditLimit)) throw new AppError("Esta compra ultrapassa o limite disponivel", 409, "CARD_LIMIT_EXCEEDED");
  const created = await db.cardPurchase.create({ data: { userId, creditCardId: card.id, categoryId: data.categoryId, subcategoryId: data.subcategoryId || null, description: data.description, merchant: nullable(data.merchant), totalAmount: data.totalAmount, purchaseDate: asDate(data.purchaseDate), installmentsCount: data.installmentsCount, notes: nullable(data.notes) } });
  const amounts = splitMoney(data.totalAmount, data.installmentsCount);
  for (let index = 0; index < amounts.length; index += 1) {
    const reference = invoiceReference(card, data.purchaseDate, index);
    const invoice = await ensureInvoice(db, userId, card, reference, amounts[index]);
    await db.cardInstallment.create({ data: { userId, creditCardId: card.id, purchaseId: created.id, invoiceId: invoice.id, number: index + 1, amount: amounts[index], dueDate: reference.dueDate } });
  }
  return created;
}

export async function cancelPurchaseInTransaction(db, userId, id) {
  const purchase = await db.cardPurchase.findFirst({ where: { id, userId }, include: { installments: { include: { invoice: true } } } });
  if (!purchase) throw new AppError("Compra nao encontrada", 404, "PURCHASE_NOT_FOUND");
  if (purchase.status === "CANCELLED") return;
  if (purchase.installments.some((item) => item.invoice.status === "PAID")) throw new AppError("Nao e possivel cancelar compra de fatura paga", 409, "PURCHASE_IN_PAID_INVOICE");
  await db.cardPurchase.update({ where: { id }, data: { status: "CANCELLED" } });
  for (const installment of purchase.installments) {
    await db.cardInstallment.update({ where: { id: installment.id }, data: { status: "CANCELLED" } });
    await db.creditCardInvoice.update({ where: { id: installment.invoiceId }, data: { totalAmount: { decrement: installment.amount } } });
  }
}

export async function createPurchase(userId, cardId, data) {
  const purchase = await prisma.$transaction(async (db) => {
    const created = await createPurchaseInTransaction(db, userId, cardId, data);
    return db.cardPurchase.findUnique({ where: { id: created.id }, include: { category: { select: { id: true, name: true } }, subcategory: { select: { id: true, name: true } }, installments: { include: { invoice: { select: { id: true, referenceYear: true, referenceMonth: true, dueDate: true } } }, orderBy: { number: "asc" } } } });
  });
  return serializePurchase(purchase);
}
export async function listPurchases(userId, cardId, includeCancelled) {
  await findCard(prisma, userId, cardId);
  const purchases = await prisma.cardPurchase.findMany({ where: { userId, creditCardId: cardId, ...(includeCancelled === "true" ? {} : { status: "ACTIVE" }) }, include: { category: { select: { id: true, name: true } }, subcategory: { select: { id: true, name: true } }, installments: { include: { invoice: { select: { id: true, referenceYear: true, referenceMonth: true, dueDate: true } } }, orderBy: { number: "asc" } } }, orderBy: { purchaseDate: "desc" } });
  return purchases.map(serializePurchase);
}
export async function updatePurchase(userId, id, data) {
  const existing = await prisma.cardPurchase.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError("Compra não encontrada", 404, "PURCHASE_NOT_FOUND");
  if (existing.status === "CANCELLED") throw new AppError("Uma compra cancelada não pode ser alterada", 409, "PURCHASE_CANCELLED");
  const updated = await prisma.cardPurchase.update({ where: { id }, data: { ...(data.description !== undefined ? { description: data.description } : {}), ...(data.merchant !== undefined ? { merchant: nullable(data.merchant) } : {}), ...(data.notes !== undefined ? { notes: nullable(data.notes) } : {}) } });
  return serializePurchase(updated);
}
export async function cancelPurchase(userId, id) {
  await prisma.$transaction(async (db) => {
    const purchase = await db.cardPurchase.findFirst({ where: { id, userId }, include: { installments: { include: { invoice: true } } } });
    if (!purchase) throw new AppError("Compra não encontrada", 404, "PURCHASE_NOT_FOUND");
    if (purchase.status === "CANCELLED") return;
    if (purchase.installments.some((item) => item.invoice.status === "PAID")) throw new AppError("Não é possível cancelar compra de fatura já paga", 409, "PURCHASE_IN_PAID_INVOICE");
    await db.cardPurchase.update({ where: { id }, data: { status: "CANCELLED" } });
    for (const installment of purchase.installments) {
      await db.cardInstallment.update({ where: { id: installment.id }, data: { status: "CANCELLED" } });
      await db.creditCardInvoice.update({ where: { id: installment.invoiceId }, data: { totalAmount: { decrement: installment.amount } } });
    }
  });
}

export async function listInvoices(userId, cardId) {
  await findCard(prisma, userId, cardId);
  const invoices = await prisma.creditCardInvoice.findMany({ where: { userId, creditCardId: cardId }, include: invoiceInclude, orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }] });
  return invoices.map(serializeInvoice);
}
export async function payInvoice(userId, id, data) {
  const invoice = await prisma.$transaction(async (db) => {
    const existing = await db.creditCardInvoice.findFirst({ where: { id, userId }, include: { creditCard: true } });
    if (!existing) throw new AppError("Fatura não encontrada", 404, "INVOICE_NOT_FOUND");
    if (existing.status === "PAID") throw new AppError("Esta fatura já foi paga", 409, "INVOICE_ALREADY_PAID");
    if (new Prisma.Decimal(existing.totalAmount).lessThanOrEqualTo(0)) throw new AppError("Esta fatura não possui valor a pagar", 409, "INVOICE_EMPTY");
    const account = await db.account.findFirst({ where: { id: data.accountId, userId, isActive: true } });
    if (!account) throw new AppError("Conta ativa não encontrada", 404, "ACCOUNT_NOT_FOUND");
    const category = await db.category.findFirst({ where: { id: data.categoryId, userId, type: "EXPENSE", isActive: true } });
    if (!category) throw new AppError("Categoria de despesa ativa não encontrada", 404, "CATEGORY_NOT_FOUND");
    const transaction = await db.transaction.create({ data: { userId, accountId: account.id, categoryId: category.id, type: "EXPENSE", description: `Pagamento da fatura ${existing.creditCard.name} ${String(existing.referenceMonth).padStart(2, "0")}/${existing.referenceYear}`, amount: existing.totalAmount, date: asDate(data.date), status: "COMPLETED", settledAt: new Date(), paymentMethod: data.paymentMethod || "PIX", notes: nullable(data.notes), creditCardInvoiceId: existing.id } });
    await db.account.update({ where: { id: account.id }, data: { currentBalance: { decrement: existing.totalAmount } } });
    await db.cardInstallment.updateMany({ where: { userId, invoiceId: existing.id, status: "PENDING" }, data: { status: "PAID" } });
    return db.creditCardInvoice.update({ where: { id: existing.id }, data: { status: "PAID", paidAt: new Date() }, include: { paymentTransaction: { select: { id: true, account: { select: { name: true } } } } } });
  });
  return serializeInvoice(invoice);
}
