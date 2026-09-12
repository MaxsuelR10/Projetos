import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeName } from "../utils/normalize-name.js";

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
  return normalizeName(String(value || "")).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

function parseDate(value) {
  const input = String(value || "").trim();
  let match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = input.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
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

function findCategory(categories, type, description) {
  const normalizedDescription = normalized(description);
  const rule = categoryRules.find(([, expression]) => expression.test(normalizedDescription));
  const desiredName = rule?.[0] || "Outros";
  return categories.find((category) => category.type === type && normalized(category.name) === normalized(desiredName))
    || categories.find((category) => category.type === type && normalized(category.name) === "outros")
    || categories.find((category) => category.type === type)
    || null;
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

function rowsFromCsv(content, categories) {
  const data = parseCsv(content);
  if (data.length < 2) throw new AppError("O arquivo precisa ter cabeçalho e ao menos um lançamento", 400, "IMPORT_FILE_EMPTY");
  const headers = data[0].map(cleanHeader);
  const dateIndex = columnIndex(headers, columnAliases.date);
  const descriptionIndex = columnIndex(headers, columnAliases.description);
  const amountIndex = columnIndex(headers, columnAliases.amount);
  const debitIndex = columnIndex(headers, columnAliases.debit);
  const creditIndex = columnIndex(headers, columnAliases.credit);
  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    throw new AppError("Não reconhecemos as colunas. O CSV deve ter Data, Descrição e Valor (ou Débito/Crédito)", 400, "IMPORT_COLUMNS_NOT_RECOGNIZED");
  }
  const invalidRows = [];
  const rows = data.slice(1).map((cells, index) => {
    const date = parseDate(cells[dateIndex]);
    const description = String(cells[descriptionIndex] || "").trim().replace(/\s+/g, " ").slice(0, 180);
    const amount = amountIndex >= 0 ? parseAmount(cells[amountIndex]) : (parseAmount(cells[debitIndex]) || parseAmount(cells[creditIndex]));
    if (!date || !description || !amount) {
      invalidRows.push(index + 2);
      return null;
    }
    const type = debitIndex >= 0 && creditIndex >= 0
      ? (String(cells[debitIndex] || "").trim() ? "EXPENSE" : "INCOME")
      : amount.type;
    const category = findCategory(categories, type, description);
    return { rowNumber: index + 2, date, description, amount: amount.amount, type, categoryId: category?.id || null, categoryName: category?.name || "Sem categoria" };
  }).filter(Boolean);
  if (!rows.length) throw new AppError("Não encontramos lançamentos válidos neste arquivo", 400, "IMPORT_ROWS_NOT_RECOGNIZED");
  return { rows, invalidRows };
}

async function activeAccount(userId, accountId) {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId, isActive: true } });
  if (!account) throw new AppError("Conta ativa não encontrada", 404, "ACCOUNT_NOT_FOUND");
  return account;
}

async function importContext(userId, accountId) {
  const [account, categories] = await Promise.all([
    activeAccount(userId, accountId),
    prisma.category.findMany({ where: { userId, isActive: true }, select: { id: true, name: true, type: true } }),
  ]);
  return { account, categories };
}

export async function previewCsvImport(userId, data) {
  const { account, categories } = await importContext(userId, data.accountId);
  const parsed = rowsFromCsv(data.content, categories);
  const dates = parsed.rows.map((row) => row.date).sort();
  const existing = await prisma.transaction.findMany({
    where: { userId, accountId: account.id, status: { not: "CANCELLED" }, date: { gte: new Date(`${dates[0]}T00:00:00.000Z`), lte: new Date(`${dates.at(-1)}T00:00:00.000Z`) } },
    select: { date: true, type: true, amount: true, description: true },
  });
  const seen = new Set();
  const rows = parsed.rows.map((row) => {
    const fingerprint = `${row.date}|${row.type}|${row.amount}|${normalized(row.description)}`;
    const duplicate = seen.has(fingerprint) || existing.some((transaction) => isSameTransaction(transaction, row));
    seen.add(fingerprint);
    return { ...row, duplicate };
  });
  return { account: { id: account.id, name: account.name }, rows, invalidRows: parsed.invalidRows };
}

export async function commitCsvImport(userId, data) {
  const { account, categories } = await importContext(userId, data.accountId);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const requested = data.rows.filter((row) => !row.duplicate);
  if (!requested.length) return { imported: 0, skipped: data.rows.length };
  const dates = requested.map((row) => row.date).sort();
  return prisma.$transaction(async (db) => {
    const existing = await db.transaction.findMany({
      where: { userId, accountId: account.id, status: { not: "CANCELLED" }, date: { gte: new Date(`${dates[0]}T00:00:00.000Z`), lte: new Date(`${dates.at(-1)}T00:00:00.000Z`) } },
      select: { date: true, type: true, amount: true, description: true },
    });
    const seen = new Set();
    let imported = 0;
    let skipped = data.rows.length - requested.length;
    for (const row of requested) {
      const category = categoryMap.get(row.categoryId);
      if (!category || category.type !== row.type) throw new AppError("Uma categoria da importação não é válida", 400, "IMPORT_CATEGORY_INVALID");
      const fingerprint = `${row.date}|${row.type}|${row.amount}|${normalized(row.description)}`;
      if (seen.has(fingerprint) || existing.some((transaction) => isSameTransaction(transaction, row))) { skipped += 1; continue; }
      seen.add(fingerprint);
      await db.transaction.create({ data: {
        userId, accountId: account.id, categoryId: category.id, type: row.type, description: row.description,
        amount: row.amount, date: new Date(`${row.date}T00:00:00.000Z`), status: "COMPLETED", paymentMethod: "OTHER", settledAt: new Date(`${row.date}T00:00:00.000Z`), notes: "Importado de extrato CSV",
      } });
      await db.account.update({ where: { id: account.id }, data: { currentBalance: row.type === "INCOME" ? { increment: row.amount } : { decrement: row.amount } } });
      imported += 1;
    }
    return { imported, skipped };
  });
}
