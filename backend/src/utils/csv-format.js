import { Prisma } from "@prisma/client";
import { AppError } from "./app-error.js";
import { normalizeCategoryRulePattern } from "./normalize-category-rule.js";

const aliases = {
  date: ["data", "date", "data da transacao", "data transacao", "data do lancamento"],
  description: ["descricao", "description", "titulo", "title", "lancamento", "historico", "estabelecimento", "transacao"],
  amount: ["valor", "amount", "valor r", "valor r$", "valor (r$)"],
  debit: ["debito", "debitos", "valor debito", "debit"], credit: ["credito", "creditos", "valor credito", "credit"],
};
export function parseCsv(content, separator) {
  const text = String(content).replace(/^\uFEFF/, "");
  const delimiter = separator || detectDelimiter(text);
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (quoted || !cell.trim()) quoted = !quoted;
      else throw new AppError("Aspas inválidas no CSV", 400, "IMPORT_CSV_INVALID");
    } else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new AppError("Há uma célula com aspas abertas no CSV", 400, "IMPORT_CSV_INVALID");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new AppError("O arquivo precisa ter cabeçalho e ao menos um lançamento", 400, "IMPORT_FILE_EMPTY");
  if (rows.length > 501) throw new AppError("O arquivo possui mais de 500 lançamentos. Divida-o em arquivos menores.", 400, "IMPORT_TOO_MANY_ROWS");
  if (rows[0].length > 100) throw new AppError("O CSV possui mais de 100 colunas", 400, "IMPORT_TOO_MANY_COLUMNS");
  return { rows, delimiter };
}
function detectDelimiter(text) {
  let quoted = false; const counts = { ";": 0, ",": 0, "\t": 0 };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') index += 1; else quoted = !quoted; }
    else if (!quoted && (char === "\n" || char === "\r")) { if (Object.values(counts).some(Boolean)) break; }
    else if (!quoted && char in counts) counts[char] += 1;
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
}
export function suggestMapping(headers, delimiter) {
  const cleaned = headers.map((value) => normalizeCategoryRulePattern(value.replace(/[()$]/g, " ")));
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => {
    const index = cleaned.findIndex((header) => names.includes(header));
    return [key, index < 0 ? null : index];
  }));
  return { delimiter, dateFormat: "AUTO", decimalSeparator: "AUTO", amountMode: columns.amount === null ? "SPLIT" : "SIGNED", ...columns };
}
export function inspectCsv(content, delimiter) {
  const parsed = parseCsv(content, delimiter);
  return { headers: parsed.rows[0], samples: parsed.rows.slice(1, 6), rowCount: parsed.rows.length - 1,
    mapping: suggestMapping(parsed.rows[0], parsed.delimiter) };
}
export function parseCsvDate(value, format = "AUTO") {
  const input = String(value || "").trim();
  let year; let month; let day;
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (iso && (format === "AUTO" || format === "ISO")) [, year, month, day] = iso;
  else {
    const parts = input.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (!parts || format === "ISO") return { error: "Data inválida para o formato escolhido" };
    const [, first, second, last] = parts; year = last;
    if (format === "AUTO" && Number(first) <= 12 && Number(second) <= 12) return { error: "Data ambígua: escolha dia/mês ou mês/dia" };
    const dayFirst = format === "DMY" || (format === "AUTO" && Number(first) > 12);
    day = dayFirst ? first : second; month = dayFirst ? second : first;
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number(year) < 1900 || Number(year) > 2099 || date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return { error: "Data inválida" };
  return { date: date.toISOString().slice(0, 10) };
}
export function parseCsvMoney(value, decimal = "AUTO") {
  let raw = String(value || "").trim().replace(/^(?:R\$|US\$|USD|EUR|\$|€)\s*/i, "").replace(/\s/g, "");
  if (!raw) return { empty: true, zero: true };
  const parenthesized = /^\(.*\)$/.test(raw); if (parenthesized) raw = raw.slice(1, -1);
  const negative = parenthesized || raw.startsWith("-"); raw = raw.replace(/^[+-]/, "");
  if (!/^\d+(?:[.,]\d+)*$/.test(raw)) return { error: "Valor inválido" };
  let separator = decimal === "COMMA" ? "," : decimal === "DOT" ? "." : null;
  if (!separator) {
    if (raw.includes(",") && raw.includes(".")) separator = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".";
    else if (raw.includes(",") || raw.includes(".")) {
      separator = raw.includes(",") ? "," : ".";
      if (raw.split(separator).length !== 2 || raw.split(separator)[1].length === 3) return { error: "Valor ambíguo: escolha o separador decimal" };
    }
  }
  const grouping = separator === "," ? "." : ",";
  const pieces = separator ? raw.split(separator) : [raw];
  if (pieces.length > 2) return { error: "Separador decimal repetido" };
  let [integer, fraction = ""] = pieces;
  if (integer.includes(grouping)) {
    const groups = integer.split(grouping);
    if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((group) => !/^\d{3}$/.test(group))) return { error: "Agrupamento de milhares inválido" };
    integer = groups.join("");
  }
  if (!/^\d{1,15}$/.test(integer) || !/^\d{0,4}$/.test(fraction)) return { error: "Valor inválido: use até quatro casas decimais" };
  const amount = new Prisma.Decimal(integer + (fraction ? "." + fraction : ""));
  return { amount: amount.toFixed(Math.max(2, fraction.length)), type: negative ? "EXPENSE" : "INCOME", zero: amount.isZero() };
}
