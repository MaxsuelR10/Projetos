// Local recurrence rules. All dates are civil ISO dates and all amounts are cents.
import {addMonth, civilDate, validCivilDate, assertPurchaseAllowed} from './billing.mjs';

const MAX_OCCURRENCES = 10_000;
const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const text = (value, max = 100) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const keyFor = (ruleId, date) => JSON.stringify([ruleId, date]);
const financialKey = transaction => JSON.stringify([
  normalize(transaction.description ?? transaction.name), transaction.date,
  transaction.type, transaction.accountId, transaction.cardId || '', transaction.amount,
]);

/** Zero-based occurrence, always anchored to the ORIGINAL start date. */
export function occurrenceDate(rule, index) {
  if (!validCivilDate(rule?.startDate) || !integer(rule.interval, 1, 120) ||
      !['day', 'week', 'month', 'year'].includes(rule.frequency) || !integer(index, 0, MAX_OCCURRENCES)) {
    throw new Error('Calendário de recorrência inválido.');
  }
  const [year, month, day] = rule.startDate.split('-').map(Number);
  const offset = index * rule.interval;
  let result;
  if (rule.frequency === 'month' || rule.frequency === 'year') {
    const nextMonth = addMonth(rule.startDate.slice(0, 7), offset * (rule.frequency === 'year' ? 12 : 1));
    result = civilDate(nextMonth, day);
  } else {
    const date = new Date(Date.UTC(year, month - 1, day + offset * (rule.frequency === 'week' ? 7 : 1)));
    result = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  if (!validCivilDate(result)) throw new Error('A recorrência ultrapassa o intervalo de datas suportado.');
  return result;
}

/** Extra validation for backups; absent recurrences remain backward compatible. */
export function validateRecurrences(state) {
  const rules = state.recurrences === undefined ? [] : state.recurrences;
  if (!Array.isArray(rules) || rules.length > 20_000) throw new Error('Lista de recorrências inválida.');
  const ruleById = new Map();
  const subscriptionIds = new Set();
  for (const rule of rules) {
    if (!rule || !text(rule.id) || ruleById.has(rule.id)) throw new Error('Identificador de recorrência inválido ou duplicado.');
    if (!text(rule.name) || !['income', 'expense'].includes(rule.type) ||
        !integer(rule.amount, 1, 100_000_000_000) || !integer(rule.interval, 1, 120) ||
        !['day', 'week', 'month', 'year'].includes(rule.frequency) ||
        !['active', 'paused', 'completed'].includes(rule.status) ||
        !validCivilDate(rule.startDate) || !validCivilDate(rule.nextOccurrenceDate) ||
        !(rule.endDate === null || validCivilDate(rule.endDate) && rule.endDate >= rule.startDate) ||
        !(rule.occurrencesLimit === null || integer(rule.occurrencesLimit, 1, MAX_OCCURRENCES)) ||
        !integer(rule.occurrencesGenerated, 0, MAX_OCCURRENCES) ||
        rule.occurrencesLimit !== null && rule.occurrencesGenerated > rule.occurrencesLimit ||
        !(rule.lastGeneratedAt === null || validCivilDate(rule.lastGeneratedAt))) {
      throw new Error('Regra de recorrência inválida.');
    }
    if (!state.accounts.some(account => account.id === rule.accountId) ||
        !state.categories.some(category => category.id === rule.categoryId) || typeof rule.cardId !== 'string') {
      throw new Error('A recorrência precisa de conta e categoria válidas.');
    }
    if (rule.cardId) {
      const card = state.cards.find(item => item.id === rule.cardId);
      if (!card || card.accountId !== rule.accountId || rule.type !== 'expense') {
        throw new Error('A recorrência de cartão precisa ser uma despesa na conta do cartão.');
      }
    }
    if (rule.nextOccurrenceDate !== occurrenceDate(rule, rule.occurrencesGenerated) ||
        rule.occurrencesGenerated === 0 && rule.lastGeneratedAt !== null ||
        rule.occurrencesGenerated > 0 && (!rule.lastGeneratedAt || rule.lastGeneratedAt < occurrenceDate(rule, rule.occurrencesGenerated - 1))) {
      throw new Error('O cursor da recorrência não corresponde ao seu calendário.');
    }
    if (rule.subscriptionId !== undefined) {
      if (!text(rule.subscriptionId) || !(state.subscriptions || []).some(item => item.id === rule.subscriptionId) ||
          subscriptionIds.has(rule.subscriptionId) || rule.interval !== 1 || !['month', 'year'].includes(rule.frequency) || rule.type !== 'expense') {
        throw new Error('Vínculo de assinatura da recorrência inválido.');
      }
      subscriptionIds.add(rule.subscriptionId);
    }
    ruleById.set(rule.id, rule);
  }
  const keys = new Set();
  const transactionIds = new Set();
  for (const transaction of state.transactions) {
    if (!transaction || !text(transaction.id) || transactionIds.has(transaction.id)) {
      throw new Error('Identificador de lançamento inválido ou duplicado.');
    }
    transactionIds.add(transaction.id);
    const linked = transaction.recurringTransactionId !== undefined || transaction.recurrenceDate !== undefined ||
      transaction.recurrenceOccurrence !== undefined || transaction.source === 'recurrence';
    if (!linked) continue;
    const rule = ruleById.get(transaction.recurringTransactionId);
    if (!rule || !integer(transaction.recurrenceOccurrence, 0, MAX_OCCURRENCES - 1) ||
        transaction.recurrenceOccurrence >= rule.occurrencesGenerated ||
        !validCivilDate(transaction.recurrenceDate) || transaction.date !== transaction.recurrenceDate ||
        transaction.recurrenceDate !== occurrenceDate(rule, transaction.recurrenceOccurrence) || transaction.source !== 'recurrence') {
      throw new Error('Lançamento com vínculo de recorrência ou cursor inválido.');
    }
    const key = keyFor(rule.id, transaction.recurrenceDate);
    if (keys.has(key)) throw new Error('Há ocorrências de recorrência duplicadas.');
    keys.add(key);
  }
  return state;
}

const exhausted = (rule, index, date) => index >= MAX_OCCURRENCES ||
  rule.occurrencesLimit !== null && index >= rule.occurrencesLimit || rule.endDate !== null && date > rule.endDate;

/** Side-effect-free preview. A visited slot advances the cursor even if a duplicate was skipped. */
export function planRecurrences(state, through, {today = localToday(), maxBatch = 1_000} = {}) {
  validateRecurrences(state);
  if (!validCivilDate(through) || !validCivilDate(today)) throw new Error('Informe uma data válida para gerar recorrências.');
  if (through > today) throw new Error('Não é permitido gerar recorrências futuras. Escolha hoje ou uma data anterior.');
  if (!integer(maxBatch, 1, MAX_OCCURRENCES)) throw new Error('Limite do lote de recorrências inválido.');
  const ownKeys = new Set(state.transactions.filter(item => item.recurringTransactionId).map(item => keyFor(item.recurringTransactionId, item.recurrenceDate)));
  // Never turn a manual row into a generated row, nor recreate cancelled own occurrences.
  const manualKeys = new Set(state.transactions.filter(item => !item.recurringTransactionId && item.status !== 'cancelled').map(financialKey));
  const rows = [], updates = [];
  for (const rule of state.recurrences || []) {
    if (rule.status !== 'active') continue;
    let index = rule.occurrencesGenerated;
    let date = rule.nextOccurrenceDate;
    while (!exhausted(rule, index, date) && date <= through) {
      if (rows.length >= maxBatch) throw new Error(`O período ultrapassa ${maxBatch} ocorrências. Escolha uma data anterior e gere em lotes menores.`);
      const row = {
        ruleId: rule.id, date, occurrence: index, name: rule.name, amount: rule.amount,
        type: rule.type, accountId: rule.accountId, categoryId: rule.categoryId, cardId: rule.cardId,
        status: ownKeys.has(keyFor(rule.id, date)) || manualKeys.has(financialKey({...rule, date})) ? 'existing' : 'new',
      };
      rows.push(row);
      index++;
      date = occurrenceDate(rule, index);
    }
    const status = exhausted(rule, index, date) ? 'completed' : rule.status;
    if (index !== rule.occurrencesGenerated || status !== rule.status) {
      updates.push({...rule, occurrencesGenerated: index, nextOccurrenceDate: date, status,
        lastGeneratedAt: index !== rule.occurrencesGenerated ? today : rule.lastGeneratedAt});
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.ruleId.localeCompare(b.ruleId));
  const newCount = rows.filter(row => row.status === 'new').length;
  return {rows, updates, newCount, existingCount: rows.length - newCount};
}

/** Build and validate everything first; only then replace the caller's state arrays. */
export function applyRecurrences(state, through, {today = localToday(), idFactory = () => globalThis.crypto.randomUUID(), maxBatch = 1_000} = {}) {
  const plan = planRecurrences(state, through, {today, maxBatch});
  if (typeof idFactory !== 'function') throw new Error('Gerador de identificadores inválido.');
  const usedIds = new Set(Object.values(state).filter(Array.isArray).flatMap(list => list.map(item => item?.id).filter(Boolean)));
  const transactions = [];
  for (const row of plan.rows.filter(item => item.status === 'new')) {
    const id = idFactory();
    if (!text(id) || usedIds.has(id)) throw new Error('Identificador de lançamento inválido ou duplicado. Nada foi gerado.');
    usedIds.add(id);
    const transaction = {
      id, description: row.name, amount: row.amount, date: row.date, dueDate: row.date,
      type: row.type, accountId: row.accountId, categoryId: row.categoryId, cardId: row.cardId,
      status: row.cardId ? 'completed' : 'pending', hidden: false, source: 'recurrence',
      recurringTransactionId: row.ruleId, recurrenceDate: row.date, recurrenceOccurrence: row.occurrence,
      ...(row.cardId ? {installmentCount: 1} : {}),
    };
    assertPurchaseAllowed(state, transaction);
    transactions.push(transaction);
  }
  const updates = new Map(plan.updates.map(rule => [rule.id, rule]));
  const updatedRules = (state.recurrences || []).map(rule => updates.get(rule.id) || rule);
  const subscriptionRules = new Map(plan.updates.filter(rule => rule.subscriptionId).map(rule => [rule.subscriptionId, rule]));
  const subscriptions = (state.subscriptions || []).map(subscription => {
    const rule = subscriptionRules.get(subscription.id);
    return rule ? {...subscription, name: rule.name, amount: rule.amount, accountId: rule.accountId,
      categoryId: rule.categoryId, cycle: rule.frequency, nextDate: rule.nextOccurrenceDate, active: rule.status === 'active'} : subscription;
  });
  const candidate = {...state, transactions: [...state.transactions, ...transactions], recurrences: updatedRules, subscriptions};
  validateRecurrences(candidate);
  state.transactions = candidate.transactions;
  state.recurrences = candidate.recurrences;
  state.subscriptions = candidate.subscriptions;
  return {...plan, generated: transactions.length};
}
