import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { brazilianDate, cardInstallmentCompetence, invoiceDates } from "../utils/financial-competence.js";
import { normalizeName } from "../utils/normalize-name.js";

const cardSelect = { id: true, name: true, institution: true, brand: true, type: true, creditLimit: true, closingDay: true, dueDay: true, color: true, isActive: true };
const invoiceInclude = {
  creditCard: { select: cardSelect },
  installments: {
    where: { status: { not: "CANCELLED" }, purchase: { status: "ACTIVE" } },
    include: { purchase: { select: { id: true, description: true, merchant: true, installmentsCount: true, category: { select: { name: true } } } } },
    orderBy: { number: "asc" },
  },
  paymentTransactions: {
    select: { id: true, amount: true, date: true, settledAt: true, status: true, updatedAt: true, accountId: true, account: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  },
};
function asDate(value) { return new Date(`${value}T00:00:00.000Z`); }
function nullable(value) { return value?.trim() || null; }
function serializeDecimal(value) { return value?.toString() ?? "0"; }
export function splitMoney(amount, count) {
  const [whole, fraction = ""] = amount.split(".");
  const units = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
  const base = units / BigInt(count); const remainder = units % BigInt(count);
  return Array.from({ length: count }, (_, index) => {
    const part = base + (BigInt(index) < remainder ? 1n : 0n);
    const integer = part / 100n; const decimal = (part % 100n).toString().padStart(2, "0");
    return `${integer}.${decimal}`;
  });
}
export function effectiveInvoiceStatus(invoice, today = asDate(brazilianDate())) {
  if (invoice.status === "PAID") return "PAID";
  if (invoice.dueDate < today) return "OVERDUE";
  return invoice.status === "CLOSED" || invoice.closingDate <= today ? "CLOSED" : "OPEN";
}
export function invoiceBalance(invoice) {
  return invoice.status === "PAID" ? new Prisma.Decimal(0) : invoice.totalAmount.minus(invoice.paidAmount);
}
function serializeCard(card, usedLimit = "0") {
  const { userId: _userId, normalizedName: _normalizedName, ...publicCard } = card;
  const used = new Prisma.Decimal(usedLimit); const limit = new Prisma.Decimal(card.creditLimit);
  return { ...publicCard, creditLimit: serializeDecimal(card.creditLimit), usedLimit: used.toString(), availableLimit: Prisma.Decimal.max(limit.minus(used), new Prisma.Decimal(0)).toString() };
}
function serializeInvoice(invoice) {
  const { userId: _userId, paymentTransactions = [], ...publicInvoice } = invoice;
  const remaining = invoiceBalance(invoice);
  const payments = paymentTransactions.map((item) => ({ ...item, amount: serializeDecimal(item.amount) }));
  const lastPayment = payments.findLast((item) => item.status === "COMPLETED");
  return {
    ...publicInvoice,
    totalAmount: serializeDecimal(invoice.totalAmount),
    paidAmount: serializeDecimal(invoice.totalAmount.minus(remaining)),
    remainingAmount: serializeDecimal(remaining),
    effectiveStatus: effectiveInvoiceStatus(invoice),
    paymentTransaction: invoice.status === "PAID" ? lastPayment : undefined,
    payments,
    installments: invoice.installments?.map((item) => ({ ...item, userId: undefined, amount: serializeDecimal(item.amount) })),
  };
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
    update: { closingDate: reference.closingDate, dueDate: reference.dueDate, totalAmount: { increment: amount } },
  });
  if (invoice.status === "PAID") throw new AppError("Não é possível lançar compra em uma fatura já paga", 409, "INVOICE_ALREADY_PAID");
  return invoice;
}

export async function lockCards(db, userId, ids) {
  for (const id of [...new Set(ids.filter(Boolean))].sort()) {
    await db.$queryRaw`SELECT "id" FROM "CreditCard" WHERE "id" = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
  }
}

export async function realignUnpaidInstallments(db, userId, card) {
  await lockCards(db, userId, [card.id]);
  const invoices = await db.$queryRaw`SELECT "id", "status", "paidAmount" FROM "CreditCardInvoice"
    WHERE "userId" = ${userId}::uuid AND "creditCardId" = ${card.id}::uuid AND "status" <> 'PAID'
    ORDER BY "id" FOR UPDATE`;
  if (invoices.some((invoice) => invoice.paidAmount.gt(0))) {
    throw new AppError("Corrija os pagamentos parciais antes de alterar o ciclo deste cartão", 409, "INVOICE_HAS_PAYMENTS");
  }
  const installments = await db.cardInstallment.findMany({
    where: { userId, creditCardId: card.id, invoice: { status: { not: "PAID" } } },
    include: { purchase: { select: { purchaseDate: true } }, invoice: { select: { id: true } } },
  });
  if (!installments.length) return;

  const affectedInvoiceIds = new Set();
  for (const installment of installments) {
    const reference = cardInstallmentCompetence(card, installment.purchase.purchaseDate, installment.number - 1);
    const target = await db.creditCardInvoice.upsert({
      where: { creditCardId_referenceYear_referenceMonth: { creditCardId: card.id, referenceYear: reference.year, referenceMonth: reference.month } },
      create: { userId, creditCardId: card.id, referenceYear: reference.year, referenceMonth: reference.month, closingDate: reference.closingDate, dueDate: reference.dueDate, totalAmount: "0" },
      update: { closingDate: reference.closingDate, dueDate: reference.dueDate },
    });
    if (target.status === "PAID") throw new AppError("A nova configuração moveria parcelas para uma fatura já paga", 409, "INSTALLMENT_TARGET_INVOICE_PAID");
    affectedInvoiceIds.add(installment.invoice.id);
    affectedInvoiceIds.add(target.id);
    await db.cardInstallment.update({ where: { id: installment.id }, data: { invoiceId: target.id, dueDate: reference.dueDate } });
  }

  const affectedInvoices = await db.creditCardInvoice.findMany({
    where: { id: { in: [...affectedInvoiceIds] }, status: { not: "PAID" } },
    include: { installments: { select: { amount: true, status: true } } },
  });
  for (const invoice of affectedInvoices) {
    const dates = invoiceDates(card, invoice.referenceYear, invoice.referenceMonth);
    const totalAmount = invoice.installments
      .filter((installment) => installment.status !== "CANCELLED")
      .reduce((total, installment) => total.plus(installment.amount), new Prisma.Decimal(0));
    await db.creditCardInvoice.update({
      where: { id: invoice.id },
      data: { ...dates, totalAmount },
    });
  }
  await db.creditCardInvoice.deleteMany({
    where: { id: { in: [...affectedInvoiceIds] }, status: { not: "PAID" }, installments: { none: {} }, paymentTransactions: { none: {} } },
  });
}

async function cardUsedLimit(db, userId, cardId) {
  const aggregate = await db.creditCardInvoice.aggregate({
    where: { userId, creditCardId: cardId, status: { not: "PAID" } },
    _sum: { totalAmount: true, paidAmount: true },
  });
  return new Prisma.Decimal(aggregate._sum.totalAmount ?? 0).minus(aggregate._sum.paidAmount ?? 0);
}

export async function listCards(userId, status) {
  const isActive = status === "all" ? undefined : status === "active";
  const cards = await prisma.creditCard.findMany({ where: { userId, ...(isActive === undefined ? {} : { isActive }) }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  if (!cards.length) return [];
  const usedLimits = await prisma.creditCardInvoice.groupBy({
    by: ["creditCardId"],
    where: { userId, creditCardId: { in: cards.map((card) => card.id) }, status: { not: "PAID" } },
    _sum: { totalAmount: true, paidAmount: true },
  });
  const usedByCardId = new Map(usedLimits.map((item) => [item.creditCardId, new Prisma.Decimal(item._sum.totalAmount ?? 0).minus(item._sum.paidAmount ?? 0)]));
  return cards.map((card) => serializeCard(card, usedByCardId.get(card.id) ?? "0"));
}
export async function getCard(userId, id) {
  const card = await findCard(prisma, userId, id);
  return serializeCard(card, await cardUsedLimit(prisma, userId, id));
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
  if (nextType === "CREDIT" && data.creditLimit !== undefined) {
    const used = await cardUsedLimit(prisma, userId, id);
    if (new Prisma.Decimal(next.creditLimit).lessThan(used)) {
      throw new AppError("O limite não pode ser menor que o valor já utilizado", 409, "CARD_LIMIT_BELOW_USED");
    }
  }
  const updated = await prisma.$transaction(async (db) => {
    const result = await db.creditCard.update({ where: { id }, data: { ...(data.name !== undefined ? { name: data.name, normalizedName: normalizeName(data.name) } : {}), ...(data.institution !== undefined ? { institution: nullable(data.institution) } : {}), ...(data.brand !== undefined ? { brand: nullable(data.brand) } : {}), ...(data.type !== undefined ? { type: data.type } : {}), ...(data.creditLimit !== undefined ? { creditLimit: data.creditLimit } : {}), ...(data.closingDay !== undefined ? { closingDay: nextType === "CREDIT" ? data.closingDay : null } : {}), ...(data.dueDay !== undefined ? { dueDay: nextType === "CREDIT" ? data.dueDay : null } : {}), ...(data.color !== undefined ? { color: data.color || null } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}) } });
    const scheduleChanged = nextType === "CREDIT" && (result.closingDay !== card.closingDay || result.dueDay !== card.dueDay);
    if (scheduleChanged) await realignUnpaidInstallments(db, userId, result);
    return result;
  });
  return getCard(userId, updated.id);
}
export async function deleteCard(userId, id) {
  const card = await findCard(prisma, userId, id);
  const count = await prisma.cardPurchase.count({ where: { userId, creditCardId: card.id } });
  if (count) throw new AppError("Este cartão possui compras e só pode ser desativado", 409, "CARD_HAS_PURCHASES");
  await prisma.creditCard.delete({ where: { id: card.id } });
}

export async function createPurchaseInTransaction(db, userId, cardId, data) {
  await lockCards(db, userId, [cardId]);
  const card = await findCard(db, userId, cardId, true);
  if (card.type !== "CREDIT") throw new AppError("CARD_NOT_CREDIT", 400, "CARD_NOT_CREDIT");
  await validateCategory(db, userId, data);
  const used = await cardUsedLimit(db, userId, card.id);
  if (used.plus(data.totalAmount).greaterThan(card.creditLimit)) throw new AppError("Esta compra ultrapassa o limite disponivel", 409, "CARD_LIMIT_EXCEEDED");
  const created = await db.cardPurchase.create({ data: { userId, creditCardId: card.id, categoryId: data.categoryId, subcategoryId: data.subcategoryId || null, description: data.description, merchant: nullable(data.merchant), totalAmount: data.totalAmount, purchaseDate: asDate(data.purchaseDate), installmentsCount: data.installmentsCount, notes: nullable(data.notes) } });
  const amounts = splitMoney(data.totalAmount, data.installmentsCount);
  for (let index = 0; index < amounts.length; index += 1) {
    const reference = cardInstallmentCompetence(card, data.purchaseDate, index);
    const invoice = await ensureInvoice(db, userId, card, reference, amounts[index]);
    await db.cardInstallment.create({ data: { userId, creditCardId: card.id, purchaseId: created.id, invoiceId: invoice.id, number: index + 1, amount: amounts[index], dueDate: reference.dueDate } });
  }
  return created;
}

export async function cancelPurchaseInTransaction(db, userId, id) {
  const purchase = await db.cardPurchase.findFirst({ where: { id, userId }, include: { installments: { orderBy: { invoiceId: "asc" } } } });
  if (!purchase) throw new AppError("Compra nao encontrada", 404, "PURCHASE_NOT_FOUND");
  if (purchase.status === "CANCELLED") return;
  await lockCards(db, userId, [purchase.creditCardId]);
  const changed = await db.cardPurchase.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "CANCELLED" } });
  if (!changed.count) return;
  for (const installment of purchase.installments) {
    const invoice = await db.creditCardInvoice.updateMany({
      where: { id: installment.invoiceId, status: { not: "PAID" }, paidAmount: 0 },
      data: { totalAmount: { decrement: installment.amount } },
    });
    if (!invoice.count) throw new AppError("Não é possível cancelar compra de uma fatura com pagamentos ativos", 409, "PURCHASE_IN_PAID_INVOICE");
    await db.cardInstallment.update({ where: { id: installment.id }, data: { status: "CANCELLED" } });
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
  await prisma.$transaction((db) => cancelPurchaseInTransaction(db, userId, id));
}

export async function listInvoices(userId, cardId, query = {}) {
  await findCard(prisma, userId, cardId);
  const invoices = await prisma.creditCardInvoice.findMany({
    // An open invoice stays payable after its closing date. Filtering it out here
    // hid overdue/current invoices from the Cards screen and made their purchases
    // appear to vanish even though the installments were still pending.
    where: { userId, creditCardId: cardId, ...(query.status === "all" || query.month ? {} : { status: { not: "PAID" }, totalAmount: { gt: prisma.creditCardInvoice.fields.paidAmount } }), ...(query.month ? { referenceYear: Number(query.month.slice(0, 4)), referenceMonth: Number(query.month.slice(5, 7)) } : {}) },
    include: invoiceInclude,
    orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
  });
  return invoices.map(serializeInvoice);
}
async function lockInvoice(db, userId, id) {
  const rows = await db.$queryRaw`SELECT "id" FROM "CreditCardInvoice" WHERE "id" = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
  if (!rows.length) throw new AppError("Fatura não encontrada", 404, "INVOICE_NOT_FOUND");
  return db.creditCardInvoice.findUniqueOrThrow({ where: { id }, include: { creditCard: { select: { name: true } } } });
}

async function requireActiveAccount(db, userId, accountId) {
  const account = await db.account.findFirst({ where: { id: accountId, userId, isActive: true }, select: { id: true } });
  if (!account) throw new AppError("Conta ativa não encontrada", 404, "ACCOUNT_NOT_FOUND");
}

function validatePaymentAmount(amount, available) {
  if (amount.lte(0) || amount.gt(available)) {
    throw new AppError("Informe um valor positivo de até o saldo da fatura", 409, "INVOICE_PAYMENT_EXCEEDS_BALANCE");
  }
}

async function refreshInvoicePaymentState(db, invoice) {
  const active = await db.transaction.aggregate({
    where: { userId: invoice.userId, creditCardInvoiceId: invoice.id, status: "COMPLETED" },
    _sum: { amount: true },
    _max: { settledAt: true },
  });
  const paidAmount = active._sum.amount ?? new Prisma.Decimal(0);
  const paid = paidAmount.gt(0) && paidAmount.eq(invoice.totalAmount);
  if (paid !== (invoice.status === "PAID")) {
    await db.cardInstallment.updateMany({
      where: { userId: invoice.userId, invoiceId: invoice.id, status: paid ? "PENDING" : "PAID" },
      data: { status: paid ? "PAID" : "PENDING" },
    });
  }
  return db.creditCardInvoice.update({
    where: { id: invoice.id },
    data: { paidAmount, status: paid ? "PAID" : invoice.status === "PAID" ? "OPEN" : invoice.status, paidAt: paid ? active._max.settledAt : null },
    include: invoiceInclude,
  });
}

export async function payInvoice(userId, id, data) {
  const invoice = await prisma.$transaction(async (db) => {
    const existing = await lockInvoice(db, userId, id);
    if (data.paymentId && await db.transaction.findUnique({ where: { id: data.paymentId }, select: { id: true } })) {
      throw new AppError("Este pagamento já foi registrado", 409, "INVOICE_PAYMENT_DUPLICATE");
    }
    if (existing.status === "PAID") throw new AppError("Esta fatura já foi paga", 409, "INVOICE_ALREADY_PAID");
    const available = invoiceBalance(existing);
    if (available.lte(0)) throw new AppError("Esta fatura não possui valor a pagar", 409, "INVOICE_EMPTY");
    const amount = data.amount === undefined ? available : new Prisma.Decimal(data.amount);
    validatePaymentAmount(amount, available);
    await requireActiveAccount(db, userId, data.accountId);
    const category = await db.category.findFirst({
      where: { userId, type: "EXPENSE", isActive: true, normalizedName: normalizeName("Outros") },
    }) ?? await db.category.findFirst({ where: { userId, type: "EXPENSE", isActive: true } });
    if (!category) throw new AppError("Cadastre uma categoria de despesa ativa antes de pagar a fatura", 409, "EXPENSE_CATEGORY_NOT_FOUND");
    const date = asDate(data.date ?? brazilianDate());
    const description = `Pagamento da fatura ${existing.creditCard.name} ${String(existing.referenceMonth).padStart(2, "0")}/${existing.referenceYear}`;
    await db.transaction.create({
      data: {
        id: data.paymentId, userId, accountId: data.accountId, categoryId: category.id, type: "EXPENSE",
        description, amount, date, status: "COMPLETED", settledAt: date, paymentMethod: data.paymentMethod || "PIX",
        notes: nullable(data.notes), creditCardInvoiceId: existing.id,
      },
    });
    await db.account.update({ where: { id: data.accountId }, data: { currentBalance: { decrement: amount } } });
    return refreshInvoicePaymentState(db, existing);
  });
  return serializeInvoice(invoice);
}

export async function changeInvoicePayment(userId, id, paymentId, data) {
  const invoice = await prisma.$transaction(async (db) => {
    const existing = await lockInvoice(db, userId, id);
    const payment = await db.transaction.findFirst({
      where: { id: paymentId, userId, creditCardInvoiceId: id, status: "COMPLETED" },
    });
    if (!payment) throw new AppError("Pagamento ativo não encontrado", 404, "INVOICE_PAYMENT_NOT_FOUND");
    if (!data) {
      await db.transaction.update({ where: { id: paymentId }, data: { status: "CANCELLED" } });
      await db.account.update({ where: { id: payment.accountId }, data: { currentBalance: { increment: payment.amount } } });
    } else {
      const amount = new Prisma.Decimal(data.amount ?? payment.amount);
      const accountId = data.accountId ?? payment.accountId;
      const date = data.date ? asDate(data.date) : payment.date;
      validatePaymentAmount(amount, invoiceBalance(existing).plus(payment.amount));
      if (accountId !== payment.accountId) await requireActiveAccount(db, userId, accountId);
      const adjustments = new Map([[payment.accountId, payment.amount]]);
      adjustments.set(accountId, (adjustments.get(accountId) ?? new Prisma.Decimal(0)).minus(amount));
      for (const account of [...adjustments.keys()].sort()) {
        await db.account.update({ where: { id: account }, data: { currentBalance: { increment: adjustments.get(account) } } });
      }
      await db.transaction.update({ where: { id: paymentId }, data: { accountId, amount, date, settledAt: date } });
    }
    return refreshInvoicePaymentState(db, existing);
  });
  return serializeInvoice(invoice);
}
