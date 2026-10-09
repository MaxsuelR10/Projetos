import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeCategoryRulePattern } from "../utils/normalize-category-rule.js";
import { createPurchaseInTransaction } from "./card.service.js";

const MAX_IMPORT_ROWS = 500;
const columnAliases = {
  date: ["data", "date", "data da transacao", "data transacao", "data do lancamento"],
  description: ["descricao", "description", "titulo", "title", "lancamento", "historico", "estabelecimento", "transacao"],
  amount: ["valor", "amount", "valor r", "valor r$", "valor (r$)"],
  debit: ["debito", "debitos", "valor debito"],
  credit: ["credito", "creditos", "valor credito"],
};

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

function cleanHeader(value) {
  return normalized(String(value || "").replace(/[()]/g, " ").replace(/\$/g, " "));
}

function normalized(value) {
  return normalizeCategoryRulePattern(value);
}

function parseCsv(content) {
  const lines = String(content || "").replace(/^\uFEFF/, "");
  const firstLine = lines.split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiter = [";", ",", "\t"].reduce((best, candidate) => (
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best
  ), ";");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < lines.length; index += 1) {
    const char = lines[index];
    if (char === '"') {
      if (quoted && lines[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && lines[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function columnIndex(headers, names) {
  return headers.findIndex((header) => names.includes(header) || names.some((name) => header.includes(name)));
}

function validIsoDate(year, month, day) {
  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    candidate.getUTCFullYear() !== Number(year)
    || candidate.getUTCMonth() !== Number(month) - 1
    || candidate.getUTCDate() !== Number(day)
  ) return null;
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  const input = String(value || "").trim();
  let match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return validIsoDate(match[1], match[2], match[3]);
  match = input.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return validIsoDate(match[3], match[2], match[1]);
  return null;
}

function parseAmount(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const negative = /^\s*-|\(.*\)$/.test(raw);
  const numeric = raw.replace(/[^\d,.-]/g, "");
  const normalized = numeric.includes(",")
    ? numeric.replace(/\./g, "").replace(",", ".")
    : numeric.replace(/,/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount === 0) return null;
  return { amount: Math.abs(amount).toFixed(2), type: negative || amount < 0 ? "EXPENSE" : "INCOME" };
}

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

function rowsFromCsv(content, categories, rules, accountId, selectedType) {
  const data = parseCsv(content);
  if (data.length < 2) throw new AppError("O arquivo precisa ter cabeçalho e ao menos um lançamento", 400, "IMPORT_FILE_EMPTY");
  if (data.length - 1 > MAX_IMPORT_ROWS) {
    throw new AppError(`O arquivo possui mais de ${MAX_IMPORT_ROWS} lançamentos. Divida-o em arquivos menores para manter a confirmação segura e atômica.`, 400, "IMPORT_TOO_MANY_ROWS");
  }
  const headers = data[0].map(cleanHeader);
  const dateIndex = columnIndex(headers, columnAliases.date);
  const descriptionIndex = columnIndex(headers, columnAliases.description);
  const amountIndex = columnIndex(headers, columnAliases.amount);
  const debitIndex = columnIndex(headers, columnAliases.debit);
  const creditIndex = columnIndex(headers, columnAliases.credit);
  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    throw new AppError("Não reconhecemos as colunas. O CSV deve ter Data, Descrição e Valor (ou Débito/Crédito)", 400, "IMPORT_COLUMNS_NOT_RECOGNIZED");
  }
  const rows = data.slice(1).map((cells, index) => {
    const date = parseDate(cells[dateIndex]);
    const description = String(cells[descriptionIndex] || "").trim().replace(/\s+/g, " ");
    const amount = amountIndex >= 0 ? parseAmount(cells[amountIndex]) : (parseAmount(cells[debitIndex]) || parseAmount(cells[creditIndex]));
    const parsedType = debitIndex >= 0 && creditIndex >= 0
      ? (String(cells[debitIndex] || "").trim() ? "EXPENSE" : (String(cells[creditIndex] || "").trim() ? "INCOME" : null))
      : amount?.type;
    const type = selectedType || parsedType || "EXPENSE";
    const suggestion = findCategory(categories, rules, accountId, type, description);
    const issues = [];
    if (!date) issues.push("Data inválida");
    if (description.length < 2) issues.push("Descrição ausente");
    if (description.length > 180) issues.push("Descrição com mais de 180 caracteres");
    if (!amount) issues.push("Valor inválido ou zerado");
    return {
      rowNumber: index + 2,
      importKey: randomUUID(),
      date: date || "",
      description,
      amount: amount?.amount || "",
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
  const parsed = rowsFromCsv(data.content, categories, rules, account.id, data.type);
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

export async function commitCsvImport(userId, data) {
  const { account, categories } = await importContext(userId, data.accountId);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const requested = data.rows;
  const isCreditCardImport = data.paymentMethod === "CREDIT_CARD";
  if (isCreditCardImport && requested.some((row) => row.type !== "EXPENSE")) {
    throw new AppError("Somente despesas podem ser importadas como compra no cartão de crédito", 400, "CARD_IMPORT_EXPENSE_ONLY");
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
