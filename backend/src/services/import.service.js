import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeCategoryRulePattern } from "../utils/normalize-category-rule.js";
import { createPurchaseInTransaction } from "./card.service.js";
import { inspectCsv, parseCsv, suggestMapping, parseCsvDate, parseCsvMoney } from "../utils/csv-format.js";

const categoryRules = [
  ["Mercado", /mercado|supermercado|atacadao|atacadão/],
  ["Alimentação", /ifood|restaurante|lanchonete|padaria|pizza|burger|cafe|café/],
  ["Transporte", /uber|99 ?pop|taxi|metro|metrô|onibus|ônibus/],
  ["Combustível", /posto|shell|ipiranga|combustivel|combustível/],
  ["Farmácia", /farmacia|farmácia|drogaria|droga ?raia/],
  ["Streaming", /netflix|spotify|prime video|disney|youtube/],
  ["Telefone", /claro|tim |vivo|telefon/],
  ["Internet", /internet|desktop|oi fibra|vivo fibra/],
  ["Energia", /enel|energia|cemig|copel|light /],
  ["Água", /sabesp|saneamento|agua|água/],
  ["Salário", /salario|salário|folha de pagamento/],
  ["Cashback", /cashback/],
];

function normalized(value) { return normalizeCategoryRulePattern(value); }

function fallbackCategory(categories, type, description) {
  const normalizedDescription = normalized(description);
  const rule = categoryRules.find(([, expression]) => expression.test(normalizedDescription));
  const desiredName = rule?.[0] || "Outros";
  return categories.find((category) => category.type === type && normalized(category.name) === normalized(desiredName))
    || categories.find((category) => category.type === type && normalized(category.name) === "outros")
    || categories.find((category) => category.type === type)
    || null;
}


function ruleRank(rule) {
  return [
    rule.matchType === "EXACT" ? 1 : 0,
    rule.accountId ? 1 : 0,
    rule.priority,
    rule.normalizedPattern.length,
  ];
}

function compareRank(first, second) {
  const firstRank = ruleRank(first);
  const secondRank = ruleRank(second);
  for (let index = 0; index < firstRank.length; index += 1) {
    if (firstRank[index] !== secondRank[index]) return secondRank[index] - firstRank[index];
  }
  return first.id.localeCompare(second.id);
}

function sameRank(first, second) {
  const secondRank = ruleRank(second);
  return ruleRank(first).every((value, index) => value === secondRank[index]);
}

function findCategory(categories, rules, accountId, type, description) {
  const normalizedDescription = normalized(description);
  const candidates = rules
    .filter((rule) => (
      rule.type === type
      && (!rule.accountId || rule.accountId === accountId)
      && rule.category.isActive
      && rule.category.type === type
      && (!rule.account || rule.account.isActive)
      && (rule.matchType === "EXACT"
        ? normalizedDescription === rule.normalizedPattern
        : normalizedDescription.includes(rule.normalizedPattern))
    ))
    .sort(compareRank);

  const winner = candidates[0];
  if (winner) {
    const tied = candidates.filter((rule) => sameRank(rule, winner));
    if (new Set(tied.map((rule) => rule.categoryId)).size === 1) {
      return { category: winner.category, source: "RULE", rule: winner, conflict: null };
    }
    return {
      category: fallbackCategory(categories, type, description),
      source: "CONFLICT",
      rule: null,
      conflict: { count: tied.length, ruleIds: tied.map((rule) => rule.id) },
    };
  }

  const heuristicRule = categoryRules.find(([, expression]) => expression.test(normalizedDescription));
  const heuristic = heuristicRule && categories.some((category) => (
    category.type === type && normalized(category.name) === normalized(heuristicRule[0])
  ));
  return {
    category: fallbackCategory(categories, type, description),
    source: heuristic ? "HEURISTIC" : "FALLBACK",
    rule: null,
    conflict: null,
  };
}

function isSameTransaction(existing, row) {
  return existing.type === row.type
    && existing.date.toISOString().slice(0, 10) === row.date
    && moneyKey(existing.amount.toString()) === moneyKey(row.amount)
    && normalized(existing.description) === normalized(row.description);
}

function moneyKey(value) {
  const [integer, decimal] = String(value).split(".");
  const trimmedDecimal = decimal?.replace(/0+$/, "");
  return trimmedDecimal ? `${integer}.${trimmedDecimal}` : integer;
}

function rowsFromCsv(content, categories, rules, accountId, selectedType, mapping) {
  const parsed = parseCsv(content, mapping?.delimiter);
  const data = parsed.rows;
  const options = mapping || { ...suggestMapping(data[0], parsed.delimiter), dateFormat: "DMY" };
  // Legacy callers retain Brazilian slash dates; the mapping flow requires explicit ambiguous formats.
  const dateIndex = options.date;
  const descriptionIndex = options.description;
  const amountIndex = options.amount;
  const debitIndex = options.debit;
  const creditIndex = options.credit;
  const indices = [dateIndex, descriptionIndex, ...(options.amountMode === "SIGNED" ? [amountIndex] : [debitIndex, creditIndex].filter((value) => value !== null))];
  if (indices.length < 3 || indices.some((value) => value === null || value >= data[0].length) || new Set(indices).size !== indices.length) {
    throw new AppError("Escolha as colunas de data, descrição e valor no mapeamento", 400, "IMPORT_COLUMNS_NOT_RECOGNIZED");
  }
  const rows = data.slice(1).map((cells, index) => {
    const dateResult = parseCsvDate(cells[dateIndex], mapping ? options.dateFormat : (/^\d{4}-/.test(cells[dateIndex] || "") ? "ISO" : "DMY"));
    const date = dateResult.date;
    const description = String(cells[descriptionIndex] || "").trim().replace(/\s+/g, " ");
    let amount; let parsedType;
    if (options.amountMode === "SIGNED") {
      amount = parseCsvMoney(cells[amountIndex], options.decimalSeparator); parsedType = amount.type;
    } else {
      const debit = parseCsvMoney(cells[debitIndex], options.decimalSeparator);
      const credit = parseCsvMoney(cells[creditIndex], options.decimalSeparator);
      if (debit.error || credit.error) amount = { error: debit.error || credit.error };
      else if (!debit.zero && !credit.zero) amount = { error: "Débito e crédito preenchidos na mesma linha: confira o extrato" };
      else if (!debit.zero) { amount = debit; parsedType = "EXPENSE"; }
      else { amount = credit; parsedType = "INCOME"; }
    }
    const type = selectedType || parsedType || "EXPENSE";
    const suggestion = findCategory(categories, rules, accountId, type, description);
    const issues = [];
    if (!date) issues.push(dateResult.error || "Data inválida");
    if (cells.length !== data[0].length) issues.push("A quantidade de colunas difere do cabeçalho");
    if (description.length < 2) issues.push("Descrição ausente");
    if (description.length > 180) issues.push("Descrição com mais de 180 caracteres");
    if (amount.error) issues.push(amount.error);
    if (!amount.amount || amount.zero) issues.push("Valor inválido ou zerado");
    return {
      rowNumber: index + 2,
      importKey: randomUUID(),
      date: date || "",
      description,
      amount: amount.error || amount.zero ? "" : (amount.amount || ""),
      type,
      categoryId: suggestion.category?.id || null,
      categoryName: suggestion.category?.name || "Sem categoria",
      suggestedCategoryId: suggestion.category?.id || null,
      categorySuggestionSource: suggestion.source,
      categoryRuleId: suggestion.rule?.id || null,
      categoryRuleLabel: suggestion.rule
        ? `${suggestion.rule.matchType === "EXACT" ? "Igual a" : "Contém"} “${suggestion.rule.pattern}”`
        : null,
      ruleConflict: suggestion.conflict,
      valid: issues.length === 0,
      issues,
    };
  });
  return { rows, invalidRows: rows.filter((row) => !row.valid).map((row) => ({ rowNumber: row.rowNumber, issues: row.issues })) };
}

async function activeAccount(userId, accountId) {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId, isActive: true } });
  if (!account) throw new AppError("Conta ativa não encontrada", 404, "ACCOUNT_NOT_FOUND");
  return account;
}

async function importContext(userId, accountId) {
  const [account, categories, rules] = await Promise.all([
    activeAccount(userId, accountId),
    prisma.category.findMany({ where: { userId, isActive: true }, select: { id: true, name: true, type: true } }),
    prisma.categoryRule.findMany({
      where: {
        userId,
        isActive: true,
        OR: [{ accountId: null }, { accountId }],
      },
      include: {
        category: { select: { id: true, name: true, type: true, isActive: true } },
        account: { select: { id: true, isActive: true } },
      },
    }),
  ]);
  return { account, categories, rules };
}

async function activeCreditCard(db, userId, creditCardId) {
  const card = await db.creditCard.findFirst({ where: { id: creditCardId, userId, type: "CREDIT", isActive: true } });
  if (!card) throw new AppError("Cartão de crédito ativo não encontrado", 404, "CARD_NOT_FOUND");
  return card;
}

export async function previewCsvImport(userId, data) {
  const { account, categories, rules } = await importContext(userId, data.accountId);
  let mapping = data.mapping;
  if (data.profileId) {
    const profile = await prisma.csvImportProfile.findFirst({ where: { id: data.profileId, userId } });
    if (!profile) throw new AppError("Perfil não encontrado", 404, "IMPORT_PROFILE_NOT_FOUND");
    const inspected = inspectCsv(data.content, profile.mapping.delimiter);
    if (JSON.stringify(inspected.headers) !== JSON.stringify(profile.headers)) throw new AppError("O cabeçalho mudou. Confira as colunas antes de usar este perfil.", 409, "IMPORT_PROFILE_HEADERS_CHANGED");
    mapping = profile.mapping;
  }
  const parsed = rowsFromCsv(data.content, categories, rules, account.id, data.type, mapping);
  const dates = parsed.rows.filter((row) => row.valid).map((row) => row.date).sort();
  const existing = dates.length ? await prisma.transaction.findMany({
    where: {
      userId,
      accountId: account.id,
      status: { not: "CANCELLED" },
      date: { gte: new Date(`${dates[0]}T00:00:00.000Z`), lte: new Date(`${dates.at(-1)}T00:00:00.000Z`) },
    },
    select: { date: true, type: true, amount: true, description: true },
  }) : [];
  const seen = new Set();
  const rows = parsed.rows.map((row) => {
    if (!row.valid) return { ...row, duplicate: false, duplicateReason: null };
    const fingerprint = `${row.date}|${row.type}|${row.amount}|${normalized(row.description)}`;
    const repeatedInFile = seen.has(fingerprint);
    const alreadyExists = existing.some((transaction) => isSameTransaction(transaction, row));
    seen.add(fingerprint);
    return {
      ...row,
      duplicate: repeatedInFile || alreadyExists,
      duplicateReason: repeatedInFile ? "Linha repetida neste arquivo" : (alreadyExists ? "Lançamento semelhante já existe" : null),
    };
  });
  const suggestedRows = rows.filter((row) => row.valid && !row.duplicate);
  const income = suggestedRows.filter((row) => row.type === "INCOME").reduce((total, row) => total.plus(row.amount), new Prisma.Decimal(0));
  const expense = suggestedRows.filter((row) => row.type === "EXPENSE").reduce((total, row) => total.plus(row.amount), new Prisma.Decimal(0));
  const projectedBalance = new Prisma.Decimal(account.currentBalance).plus(income).minus(expense);
  return {
    importId: randomUUID(),
    account: { id: account.id, name: account.name, currentBalance: account.currentBalance.toString() },
    rows,
    invalidRows: parsed.invalidRows,
    summary: {
      currentBalance: account.currentBalance.toString(),
      income: income.toString(),
      expense: expense.toString(),
      projectedBalance: projectedBalance.toString(),
    },
  };
}

export async function inspectCsvImport(userId, data) {
  await activeAccount(userId, data.accountId);
  return inspectCsv(data.content, data.delimiter);
}
export async function listImportProfiles(userId) {
  return prisma.csvImportProfile.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, headers: true, mapping: true } });
}
export async function saveImportProfile(userId, data) {
  const mappingColumns = [data.mapping.date, data.mapping.description, ...(data.mapping.amountMode === "SIGNED" ? [data.mapping.amount] : [data.mapping.debit, data.mapping.credit].filter((value) => value !== null))];
  if (mappingColumns.some((index) => index >= data.headers.length)) throw new AppError("Coluna fora do cabeçalho", 400, "IMPORT_PROFILE_INVALID");
  return prisma.csvImportProfile.upsert({ where: { userId_name: { userId, name: data.name } }, create: { userId, ...data }, update: data, select: { id: true, name: true, headers: true, mapping: true } });
}
export async function deleteImportProfile(userId, id) {
  const result = await prisma.csvImportProfile.deleteMany({ where: { id, userId } });
  if (!result.count) throw new AppError("Perfil não encontrado", 404, "IMPORT_PROFILE_NOT_FOUND");
}

export async function commitCsvImport(userId, data) {
  const { account, categories } = await importContext(userId, data.accountId);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const requested = data.rows;
  const isCreditCardImport = data.paymentMethod === "CREDIT_CARD";
  if (isCreditCardImport && requested.some((row) => row.type !== "EXPENSE")) {
    throw new AppError("Somente despesas podem ser importadas como compra no cartão de crédito", 400, "CARD_IMPORT_EXPENSE_ONLY");
  }
  if (isCreditCardImport && requested.some((row) => !new Prisma.Decimal(row.amount).equals(new Prisma.Decimal(row.amount).toDecimalPlaces(2)))) {
    throw new AppError("Compras no cartão devem ter no máximo duas casas decimais. Confira os valores antes de importar.", 400, "CARD_IMPORT_PRECISION");
  }
  const dates = requested.map((row) => row.date).sort();
  try {
    return await prisma.$transaction(async (db) => {
      if (isCreditCardImport) await activeCreditCard(db, userId, data.creditCardId);
      const [existing, previouslyImported] = await Promise.all([
        db.transaction.findMany({
          where: { userId, accountId: account.id, status: { not: "CANCELLED" }, date: { gte: new Date(`${dates[0]}T00:00:00.000Z`), lte: new Date(`${dates.at(-1)}T00:00:00.000Z`) } },
          select: { date: true, type: true, amount: true, description: true },
        }),
        db.transaction.findMany({
          where: { userId, importId: data.importId, importRowKey: { in: requested.map((row) => row.importKey) } },
          select: { importRowKey: true },
        }),
      ]);
      const importedKeys = new Set(previouslyImported.map((row) => row.importRowKey));
      const seen = new Set();
      const records = [];
      const ruleRecords = [];
      let duplicates = 0;

      for (const row of requested) {
        if (importedKeys.has(row.importKey)) {
          duplicates += 1;
          continue;
        }
        const category = categoryMap.get(row.categoryId);
        if (!category || category.type !== row.type) throw new AppError("Uma categoria da importação não é válida", 400, "IMPORT_CATEGORY_INVALID");
        const fingerprint = `${row.date}|${row.type}|${row.amount}|${normalized(row.description)}`;
        const likelyDuplicate = seen.has(fingerprint) || existing.some((transaction) => isSameTransaction(transaction, row));
        if (likelyDuplicate && !row.allowDuplicate) {
          duplicates += 1;
          seen.add(fingerprint);
          continue;
        }
        seen.add(fingerprint);
        const date = new Date(`${row.date}T00:00:00.000Z`);
        records.push({
          userId, accountId: account.id, categoryId: category.id, type: row.type, description: row.description,
          amount: row.amount, date, status: "COMPLETED", paymentMethod: "OTHER", settledAt: date, notes: "Importado de extrato CSV",
          importId: data.importId, importRowKey: row.importKey,
        });
        if (row.saveRule) {
          const normalizedPattern = normalizeCategoryRulePattern(row.rulePattern);
          if (normalizedPattern.length < 2) {
            throw new AppError("Uma regra da importação possui texto inválido", 400, "CATEGORY_RULE_PATTERN_INVALID");
          }
          ruleRecords.push({
            userId,
            accountId: row.ruleAccountScoped ? account.id : null,
            categoryId: category.id,
            type: row.type,
            matchType: row.ruleMatchType,
            pattern: row.rulePattern,
            normalizedPattern,
            sourceImportId: data.importId,
            sourceImportRowKey: row.importKey,
          });
        }
      }

      const result = (imported, balanceAfter, rulesCreated = 0) => ({
        imported,
        rulesCreated,
        ignored: data.ignoredCount,
        duplicates,
        rejected: 0,
        skipped: data.ignoredCount + duplicates,
        balanceAfter,
      });
      if (!records.length) return result(0, account.currentBalance.toString(), 0);

      if (isCreditCardImport) {
        for (const record of records) {
          const purchase = await createPurchaseInTransaction(db, userId, data.creditCardId, {
            categoryId: record.categoryId,
            description: record.description,
            totalAmount: record.amount,
            purchaseDate: record.date.toISOString().slice(0, 10),
            installmentsCount: 1,
            notes: "Importado de extrato CSV",
          });
          await db.transaction.create({ data: {
            ...record,
            paymentMethod: "CREDIT_CARD",
            creditCardId: data.creditCardId,
            cardPurchaseId: purchase.id,
            settledAt: null,
          } });
        }
        const createdRules = ruleRecords.length
          ? await db.categoryRule.createMany({ data: ruleRecords, skipDuplicates: true }) : { count: 0 };
        return result(records.length, account.currentBalance.toString(), createdRules.count);
      }

      // One insert and one balance adjustment prevent imports from timing out
      // when the database is remote and the statement contains many rows.
      await db.transaction.createMany({ data: records });
      const netAmount = records.reduce(
        (total, row) => row.type === "INCOME" ? total.plus(row.amount) : total.minus(row.amount),
        new Prisma.Decimal(0),
      );
      const updatedAccount = await db.account.update({
        where: { id: account.id },
        data: {
          currentBalance: netAmount.isNegative()
            ? { decrement: netAmount.abs().toString() }
            : { increment: netAmount.toString() },
        },
        select: { currentBalance: true },
      });
      const createdRules = ruleRecords.length
        ? await db.categoryRule.createMany({ data: ruleRecords, skipDuplicates: true }) : { count: 0 };
      return result(records.length, updatedAccount.currentBalance.toString(), createdRules.count);
    }, { maxWait: 5_000, timeout: isCreditCardImport ? 30_000 : 10_000 });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("Erro ao importar extrato CSV", { code: error?.code, message: error?.message, userId, accountId: account.id });
    throw new AppError("Não foi possível salvar este extrato agora. Tente novamente em alguns instantes.", 500, "IMPORT_COMMIT_FAILED");
  }
}
