import {accountBalance, normalize, uid, validateState} from './domain.mjs';
import {validCivilDate, validMonth, cycleConfigured, invoiceFor, purchaseInvoiceMonth, assertPurchaseAllowed, hasPaidPurchase} from './billing.mjs';

export function applyCsvType(records, type='auto') {
  if(!['auto','expense','income'].includes(type))throw new Error('Escolha Despesa, Receita ou Usar o tipo do arquivo.');
  const result=records.map(record=>({...record,type:type==='auto'?record.type:type}));
  result.skippedPayments=records.skippedPayments||0;
  return result;
}

export function canCorrectCsvType(state, row) {
  return row.source==='csv'&&['income','expense'].includes(row.type)&&!row.invoicePaymentId&&!row.recurringTransactionId&&!row.subscriptionId&&!row.isSubscription&&!hasPaidPurchase(state,row.id);
}

// Preview and confirmation share this pure plan; protected records abort the
// whole operation instead of partially changing account balances.
export function planCsvTypeCorrection(state, ids, type) {
  if(!['expense','income'].includes(type))throw new Error('Escolha Despesa ou Receita.');
  const selected=new Set(ids);
  if(!selected.size)throw new Error('Selecione os lançamentos importados que deseja corrigir.');
  const rows=[...selected].map(id=>state.transactions.find(row=>row.id===id));
  if(rows.some(row=>!row||!canCorrectCsvType(state,row)||row.cardId&&type!=='expense'))throw new Error('A seleção contém um registro protegido ou incompatível. Revise os lançamentos.');
  const next=structuredClone(state);
  const changes=next.transactions.filter(row=>selected.has(row.id)&&row.type!==type);
  if(!changes.length)throw new Error('Os lançamentos selecionados já estão com esse tipo.');
  for(const row of changes)row.type=type;
  validateState(next);
  const accounts=state.accounts.filter(account=>rows.some(row=>row.accountId===account.id)).map(account=>({id:account.id,name:account.name,before:accountBalance(state,account.id),after:accountBalance(next,account.id)}));
  return {transactions:next.transactions,accounts,count:changes.length};
}

const fingerprint = row => [row.date, row.type, row.amount, normalize(row.description.trim()), row.accountId].join('|');

export function csvCardCorrectionCandidates(state, card, month) {
  if (!cycleConfigured(card) || !validMonth(month)) return [];
  return state.transactions.filter(row =>
    row.accountId === card.accountId && !row.cardId && row.type === 'expense' &&
    row.status !== 'cancelled' && normalize(row.description.trim()) !== 'pagamento recebido' &&
    canCorrectCsvType(state, row) && purchaseInvoiceMonth(card, row.date) === month
  );
}

export function planCsvCardCorrection(state, {ids, cardId, month}) {
  const card = state.cards.find(row => row.id === cardId);
  if (!card || !cycleConfigured(card) || !validMonth(month)) {
    throw new Error('Selecione uma fatura com fechamento e vencimento configurados.');
  }
  const selected = new Set(ids);
  if (!selected.size) throw new Error('Selecione as compras importadas que deseja vincular.');
  const rows = csvCardCorrectionCandidates(state, card, month).filter(row => selected.has(row.id));
  if (rows.length !== selected.size) {
    throw new Error('A seleção contém lançamentos protegidos, já vinculados ou fora do ciclo desta fatura.');
  }

  const before = invoiceFor(state, card, month);
  if (before.status === 'paid') throw new Error('A fatura já foi paga e está protegida.');
  const existing = new Set(state.transactions.filter(row => row.cardId === cardId && row.status !== 'cancelled').map(fingerprint));
  const replacements = new Map();
  for (const row of rows) {
    const key = fingerprint(row);
    if (existing.has(key)) {
      throw new Error(`Possível compra duplicada no cartão: ${row.description}. Revise a seleção.`);
    }
    existing.add(key);
    const purchase = {...row, cardId, status:'completed', installmentCount:1};
    delete purchase.settledAt;
    replacements.set(row.id, purchase);
  }
  const next = {...state, transactions:state.transactions.map(row => replacements.get(row.id) || row)};
  validateState(next);
  return {
    transactions:next.transactions,
    count:rows.length,
    accountBefore:accountBalance(state, card.accountId),
    accountAfter:accountBalance(next, card.accountId),
    invoiceBefore:before,
    invoiceAfter:invoiceFor(next, card, month)
  };
}

// Pure preview: no IDs, persistence, network calls, or financial mutations.
export function previewCsvImport(state, records, accountId, cardId = '', invoiceMonth = '') {
  const card=cardId ? state.cards.find(c=>c.id===cardId) : null;
  if(cardId&&!card)throw new Error('Selecione um cartão válido.');
  if(card&&card.accountId!==accountId)throw new Error('A conta deve ser a vinculada ao cartão.');
  if(card&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(invoiceMonth))throw new Error('Informe o mês de vencimento da fatura.');
  if (!state.accounts.some(account => account.id === accountId)) throw new Error('Selecione uma conta válida.');
  if (!Array.isArray(records) || !records.length) throw new Error('O arquivo não contém lançamentos.');
  if (records.length > 10_000) throw new Error('Importe até 10.000 linhas por arquivo.');
  // Invoice payments are real cash debits too: matching bank CSV rows must not
  // create a second debit. Credit purchases themselves do not move account cash.
  const seen = new Set(state.transactions.filter(row => (card ? row.cardId===card.id : !row.cardId) && row.status !== 'cancelled').map(fingerprint));
  const rows = records.map((record, index) => {
    if (!validCivilDate(record.date) || !['income', 'expense'].includes(record.type) || !Number.isSafeInteger(record.amount) || record.amount <= 0 || record.amount > 100_000_000_000) throw new Error(`Revise a data, o tipo e o valor do registro ${index + 1}.`);
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    if (!description || description.length > 240) throw new Error(`Revise a descrição do registro ${index + 1}.`);
    const category = state.categories.find(item => normalize(item.name) === normalize(record.categoryName || ''))
      || state.categories.find(item => item.keywords.some(keyword => normalize(description).includes(normalize(keyword))))
      || state.categories.find(item => item.id === 'other') || state.categories[0];
    if (!category) throw new Error('Cadastre uma categoria antes de importar.');
    if(card && (record.type!=='expense' || purchaseInvoiceMonth(card,record.date)!==invoiceMonth))throw new Error(`A linha ${index+1} não corresponde ao ciclo do cartão para a fatura selecionada. Confira fechamento e vencimento antes de importar.`);
    const row = {index, date: record.date, description, type: record.type, amount: record.amount, accountId, categoryId: category.id};
    const key = fingerprint(row), duplicate = seen.has(key);
    seen.add(key);
    return {...row, duplicate};
  });
  return {accountId, cardId, invoiceMonth, rows, balanceBefore: accountBalance(state, accountId), duplicateCount: rows.filter(row => row.duplicate).length};
}

export function csvSelectionSummary(preview, selectedIndices) {
  const selected = new Set(selectedIndices);
  const rows = preview.rows.filter(row => !row.duplicate && selected.has(row.index));
  const income = rows.filter(row => row.type === 'income').reduce((sum, row) => sum + row.amount, 0);
  const expense = rows.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0);
  const balanceAfter = preview.balanceBefore + (preview.cardId ? 0 : income - expense);
  if (![income, expense, balanceAfter].every(Number.isSafeInteger)) throw new Error('O total do arquivo excede o limite seguro.');
  return {count: rows.length, income, expense, netEffect: preview.cardId ? 0 : income - expense, balanceBefore: preview.balanceBefore, balanceAfter};
}

// Recalculate against current state at confirmation, including internal duplicates.
export function buildCsvImport(state, records, accountId, selectedIndices, idFactory = uid, cardId = '', invoiceMonth = '') {
  const preview = previewCsvImport(state, records, accountId, cardId, invoiceMonth);
  const summary = csvSelectionSummary(preview, selectedIndices);
  if (!summary.count) throw new Error('Selecione ao menos um lançamento novo.');
  const selected = new Set(selectedIndices), ids = new Set(state.transactions.map(row => row.id));
  const transactions = preview.rows.filter(row => !row.duplicate && selected.has(row.index)).map(({index, duplicate, ...row}) => {
    const id = idFactory();
    if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('Não foi possível gerar um identificador único. Tente novamente.');
    ids.add(id);
    return {...row, id, status: 'completed', settledAt: row.date, cardId, hidden: false, source: 'csv'};
  });
  if(cardId){const next=structuredClone(state);for(const transaction of transactions){assertPurchaseAllowed(next,transaction);next.transactions.push(transaction);}}
  return {transactions, summary, duplicateCount: preview.duplicateCount};
}
