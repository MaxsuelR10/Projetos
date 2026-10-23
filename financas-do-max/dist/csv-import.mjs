import {accountBalance, normalize, uid} from './domain.mjs';
import {validCivilDate} from './billing.mjs';

const fingerprint = row => [row.date, row.type, row.amount, normalize(row.description.trim()), row.accountId].join('|');

// Pure preview: no IDs, persistence, network calls, or financial mutations.
export function previewCsvImport(state, records, accountId) {
  if (!state.accounts.some(account => account.id === accountId)) throw new Error('Selecione uma conta válida.');
  if (!Array.isArray(records) || !records.length) throw new Error('O arquivo não contém lançamentos.');
  if (records.length > 10_000) throw new Error('Importe até 10.000 linhas por arquivo.');
  // Invoice payments are real cash debits too: matching bank CSV rows must not
  // create a second debit. Credit purchases themselves do not move account cash.
  const seen = new Set(state.transactions.filter(row => !row.cardId && row.status !== 'cancelled').map(fingerprint));
  const rows = records.map((record, index) => {
    if (!validCivilDate(record.date) || !['income', 'expense'].includes(record.type) || !Number.isSafeInteger(record.amount) || record.amount <= 0 || record.amount > 100_000_000_000) throw new Error(`Revise a data, o tipo e o valor do registro ${index + 1}.`);
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    if (!description || description.length > 240) throw new Error(`Revise a descrição do registro ${index + 1}.`);
    const category = state.categories.find(item => normalize(item.name) === normalize(record.categoryName || ''))
      || state.categories.find(item => item.keywords.some(keyword => normalize(description).includes(normalize(keyword))))
      || state.categories.find(item => item.id === 'other') || state.categories[0];
    if (!category) throw new Error('Cadastre uma categoria antes de importar.');
    const row = {index, date: record.date, description, type: record.type, amount: record.amount, accountId, categoryId: category.id};
    const key = fingerprint(row), duplicate = seen.has(key);
    seen.add(key);
    return {...row, duplicate};
  });
  return {accountId, rows, balanceBefore: accountBalance(state, accountId), duplicateCount: rows.filter(row => row.duplicate).length};
}

export function csvSelectionSummary(preview, selectedIndices) {
  const selected = new Set(selectedIndices);
  const rows = preview.rows.filter(row => !row.duplicate && selected.has(row.index));
  const income = rows.filter(row => row.type === 'income').reduce((sum, row) => sum + row.amount, 0);
  const expense = rows.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0);
  const balanceAfter = preview.balanceBefore + income - expense;
  if (![income, expense, balanceAfter].every(Number.isSafeInteger)) throw new Error('O total do arquivo excede o limite seguro.');
  return {count: rows.length, income, expense, netEffect: income - expense, balanceBefore: preview.balanceBefore, balanceAfter};
}

// Recalculate against current state at confirmation, including internal duplicates.
export function buildCsvImport(state, records, accountId, selectedIndices, idFactory = uid) {
  const preview = previewCsvImport(state, records, accountId);
  const summary = csvSelectionSummary(preview, selectedIndices);
  if (!summary.count) throw new Error('Selecione ao menos um lançamento novo.');
  const selected = new Set(selectedIndices), ids = new Set(state.transactions.map(row => row.id));
  const transactions = preview.rows.filter(row => !row.duplicate && selected.has(row.index)).map(({index, duplicate, ...row}) => {
    const id = idFactory();
    if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('Não foi possível gerar um identificador único. Tente novamente.');
    ids.add(id);
    return {...row, id, status: 'completed', settledAt: row.date, cardId: '', hidden: false, source: 'csv'};
  });
  return {transactions, summary, duplicateCount: preview.duplicateCount};
}
