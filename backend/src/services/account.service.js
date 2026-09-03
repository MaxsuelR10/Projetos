import { prisma } from "../config/database.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../utils/app-error.js";
import { normalizeName } from "../utils/normalize-name.js";

function nullable(value) {
  return value?.trim() || null;
}

function serializeAccount(account, pendingExpenses = "0") {
  const { normalizedName: _normalizedName, userId: _userId, ...publicAccount } = account;

  return {
    ...publicAccount,
    initialBalance: account.initialBalance.toString(),
    currentBalance: account.currentBalance.toString(),
    projectedBalance: account.currentBalance.minus(pendingExpenses).toString(),
    pendingCommitments: pendingExpenses.toString(),
  };
}

async function pendingByAccount(userId, accountIds) {
  const rows = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { userId, accountId: { in: accountIds }, type: "EXPENSE", cardPurchaseId: null, OR: [{ status: "OVERDUE" }, { status: "PENDING", dueDate: { lte: new Date() } }] },
    _sum: { amount: true },
  });
  return new Map(rows.map((row) => [row.accountId, row._sum.amount ?? 0]));
}

async function findAccount(userId, id) {
  const account = await prisma.account.findFirst({ where: { id, userId } });

  if (!account) {
    throw new AppError("Conta não encontrada", 404, "ACCOUNT_NOT_FOUND");
  }

  return account;
}

async function ensureUniqueAccountName(userId, name, ignoredId) {
  const existing = await prisma.account.findFirst({
    where: {
      userId,
      normalizedName: normalizeName(name),
      ...(ignoredId ? { id: { not: ignoredId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new AppError("Já existe uma conta com este nome", 409, "ACCOUNT_NAME_IN_USE");
  }
}

export async function listAccounts(userId, status) {
  const isActive = status === "all" ? undefined : status === "active";
  const accounts = await prisma.account.findMany({
    where: { userId, ...(isActive === undefined ? {} : { isActive }) },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const commitments = await pendingByAccount(userId, accounts.map((account) => account.id));
  return accounts.map((account) => serializeAccount(account, commitments.get(account.id) ?? "0"));
}

export async function getAccount(userId, id) {
  const account = await findAccount(userId, id);
  const commitments = await pendingByAccount(userId, [id]);
  return serializeAccount(account, commitments.get(id) ?? "0");
}

export async function createAccount(userId, data) {
  await ensureUniqueAccountName(userId, data.name);

  try {
    const account = await prisma.account.create({
      data: {
        userId,
        name: data.name,
        normalizedName: normalizeName(data.name),
        institution: nullable(data.institution),
        type: data.type,
        initialBalance: data.initialBalance,
        currentBalance: data.initialBalance,
        color: data.color || null,
        icon: nullable(data.icon),
        isActive: data.isActive ?? true,
      },
    });

    return serializeAccount(account);
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError("Já existe uma conta com este nome", 409, "ACCOUNT_NAME_IN_USE");
    }

    throw error;
  }
}

export async function updateAccount(userId, id, data) {
  const account = await findAccount(userId, id);

  if (data.name !== undefined) {
    await ensureUniqueAccountName(userId, data.name, id);
  }

  const updateData = {
    ...(data.name !== undefined
      ? { name: data.name, normalizedName: normalizeName(data.name) }
      : {}),
    ...(data.institution !== undefined ? { institution: nullable(data.institution) } : {}),
    ...(data.type !== undefined ? { type: data.type } : {}),
    ...(data.color !== undefined ? { color: data.color || null } : {}),
    ...(data.icon !== undefined ? { icon: nullable(data.icon) } : {}),
    ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
  };

  const updatedAccount = await prisma.account.update({
    where: { id: account.id },
    data: updateData,
  });

  return serializeAccount(updatedAccount);
}

export async function adjustAccountBalance(userId, id, currentBalance) {
  const updatedAccount = await prisma.$transaction(async (db) => {
    const account = await db.account.findFirst({ where: { id, userId } });
    if (!account) throw new AppError("Conta nÃ£o encontrada", 404, "ACCOUNT_NOT_FOUND");

    const newBalance = new Prisma.Decimal(currentBalance);
    await db.accountBalanceAdjustment.create({
      data: {
        userId,
        accountId: account.id,
        previousBalance: account.currentBalance,
        newBalance,
        difference: newBalance.minus(account.currentBalance),
      },
    });

    return db.account.update({ where: { id: account.id }, data: { currentBalance: newBalance } });
  });

  return serializeAccount(updatedAccount);
}

export async function listAccountBalanceAdjustments(userId, id) {
  await findAccount(userId, id);
  const adjustments = await prisma.accountBalanceAdjustment.findMany({
    where: { userId, accountId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return adjustments.map(({ userId: _userId, ...item }) => ({
    ...item,
    previousBalance: item.previousBalance.toString(),
    newBalance: item.newBalance.toString(),
    difference: item.difference.toString(),
  }));
}

const dependencyDefinitions = [
  { key: "transactions", label: "lançamentos", count: (db, accountId, userId) => db.transaction.count({ where: { accountId, userId, creditCardInvoiceId: null } }) },
  { key: "invoicePayments", label: "pagamentos de fatura", count: (db, accountId, userId) => db.transaction.count({ where: { accountId, userId, creditCardInvoiceId: { not: null } } }) },
  { key: "transfers", label: "transferências", count: (db, accountId, userId) => db.transfer.count({ where: { userId, OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] } }) },
  { key: "recurrences", label: "recorrências", count: (db, accountId, userId) => db.recurringTransaction.count({ where: { accountId, userId } }) },
  { key: "subscriptions", label: "assinaturas", count: (db, accountId, userId) => db.subscription.count({ where: { accountId, userId } }) },
  { key: "goals", label: "metas", count: (db, accountId, userId) => db.financialGoal.count({ where: { accountId, userId } }) },
  { key: "investments", label: "investimentos", count: (db, accountId, userId) => db.investment.count({ where: { accountId, userId } }) },
  { key: "balanceHistory", label: "ajustes de saldo", count: (db, accountId, userId) => db.accountBalanceAdjustment.count({ where: { accountId, userId } }) },
];

async function countAccountDependencies(db, userId, accountId) {
  const items = (await Promise.all(dependencyDefinitions.map(async (definition) => ({
    key: definition.key,
    label: definition.label,
    count: await definition.count(db, accountId, userId),
  })))).filter((item) => item.count > 0);
  return { total: items.reduce((sum, item) => sum + item.count, 0), items };
}

export async function getAccountDependencies(userId, id) {
  const account = await findAccount(userId, id);
  return countAccountDependencies(prisma, userId, account.id);
}

async function legacyDeleteAccount(userId, id) {
  const account = await findAccount(userId, id);

  const linkedRecords = await prisma.$transaction(async (transaction) => {
    const [transactions, outgoingTransfers, incomingTransfers] = await Promise.all([
      transaction.transaction.count({ where: { accountId: account.id, userId } }),
      transaction.transfer.count({ where: { fromAccountId: account.id, userId } }),
      transaction.transfer.count({ where: { toAccountId: account.id, userId } }),
    ]);

    if (transactions + outgoingTransfers + incomingTransfers > 0) {
      throw new AppError(
        "Esta conta possui movimentações e só pode ser desativada",
        409,
        "ACCOUNT_HAS_MOVEMENTS",
      );
    }

    return transaction.account.delete({ where: { id: account.id } });
  });

  return serializeAccount(linkedRecords);
}

export async function deleteAccount(userId, id) {
  const account = await findAccount(userId, id);
  const deletedAccount = await prisma.$transaction(async (transaction) => {
    const dependencies = await countAccountDependencies(transaction, userId, account.id);
    if (dependencies.total > 0) {
      throw new AppError(
        "Esta conta possui vínculos financeiros e só pode ser desativada para preservar o histórico",
        409,
        "ACCOUNT_HAS_DEPENDENCIES",
        dependencies,
      );
    }
    return transaction.account.delete({ where: { id: account.id } });
  });
  return serializeAccount(deletedAccount);
}
