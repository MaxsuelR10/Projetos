// Bounded local convenience history. It is NOT tamperproof or a bank audit trail.
const MAX_EVENTS = 300;
const MAX_CHANGES = 50;
const MAX_TEXT = 240;
const FIELDS = {
  accounts: ['id', 'name', 'type', 'color', 'openingBalance'],
  categories: ['id', 'name', 'icon', 'color', 'budget'],
  transactions: ['id', 'description', 'amount', 'type', 'date', 'dueDate', 'settledAt', 'status', 'accountId', 'toAccountId', 'categoryId', 'cardId', 'installmentCount', 'hidden', 'source', 'invoicePaymentId', 'recurringTransactionId', 'recurrenceDate', 'recurrenceOccurrence', 'isSubscription', 'subscriptionId'],
  cards: ['id', 'name', 'last4', 'accountId', 'limit', 'closingDay', 'dueDay', 'color'],
  invoicePayments: ['id', 'cardId', 'month', 'accountId', 'date', 'amount'],
  installments: ['id', 'name', 'amount', 'totalAmount', 'paidAmount', 'count', 'paid', 'accountId', 'categoryId', 'hidden'],
  subscriptions: ['id', 'name', 'amount', 'cycle', 'nextDate', 'accountId', 'categoryId', 'cardId', 'active', 'recurrenceId'],
  investments: ['id', 'name', 'kind', 'amount'],
  recurrences: ['id', 'name', 'type', 'amount', 'accountId', 'categoryId', 'cardId', 'frequency', 'interval', 'startDate', 'endDate', 'occurrencesLimit', 'occurrencesGenerated', 'nextOccurrenceDate', 'status', 'lastGeneratedAt', 'subscriptionId'],
  agents: ['id', 'name', 'description', 'kind', 'frequency', 'active', 'limit', 'categoryId'],
  profile: ['name', 'monthlyGoal', 'salary', 'palette', 'surface', 'customColor'],
};
const NUMBERS = new Set(['openingBalance', 'budget', 'amount', 'installmentCount', 'limit', 'closingDay', 'dueDay', 'totalAmount', 'paidAmount', 'count', 'paid', 'interval', 'occurrencesLimit', 'occurrencesGenerated', 'recurrenceOccurrence', 'monthlyGoal', 'salary']);
const BOOLEANS = new Set(['hidden', 'active', 'isSubscription']);
const NULLABLE = new Set(['endDate', 'occurrencesLimit', 'lastGeneratedAt', 'settledAt']);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const plain = object => object !== null && typeof object === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(object));
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = (value, max = MAX_TEXT, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0) && !/[\u0000-\u001f\u007f]/.test(value);
const id = value => text(value, 120, true);
const clean = value => value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_TEXT);
const fail = () => { throw new Error('Histórico local inválido ou fora dos limites permitidos.'); };
const exactKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => has(value, key));
const validTime = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) && time.toISOString() === value;
};

function validValue(key, value) {
  if (value === null) return NULLABLE.has(key);
  if (NUMBERS.has(key)) return Number.isSafeInteger(value);
  if (BOOLEANS.has(key)) return typeof value === 'boolean';
  return text(value);
}

function validateSnapshot(value, entity, entityId) {
  if (!plain(value) || Object.keys(value).length > FIELDS[entity].length) fail();
  for (const [key, entry] of Object.entries(value)) {
    if (!FIELDS[entity].includes(key) || !validValue(key, entry)) fail();
  }
  if (entity !== 'profile' && (!has(value, 'id') || value.id !== entityId)) fail();
}

/** Optional fields preserve old backups; unknown/nested metadata is not accepted. */
export function validateAudit(state) {
  if (!plain(state)) fail();
  if (has(state, 'auditLogDropped') && !integer(state.auditLogDropped)) fail();
  if (!has(state, 'auditLog')) return state;
  if (!Array.isArray(state.auditLog) || state.auditLog.length > MAX_EVENTS) fail();
  const ids = new Set();
  for (const event of state.auditLog) {
    if (!exactKeys(event, ['id', 'at', 'action', 'changes', 'omittedChanges']) || !id(event.id) || ids.has(event.id) ||
        !validTime(event.at) || !text(event.action, MAX_TEXT, true) || !integer(event.omittedChanges) ||
        !Array.isArray(event.changes) || event.changes.length < 1 || event.changes.length > MAX_CHANGES) fail();
    ids.add(event.id);
    const changedIds = new Set();
    for (const change of event.changes) {
      if (!exactKeys(change, ['entity', 'entityId', 'name', 'operation', 'before', 'after']) ||
          !has(FIELDS, change.entity) || !id(change.entityId) || !text(change.name, MAX_TEXT, true) ||
          !['create', 'update', 'remove'].includes(change.operation) || change.entity === 'profile' && change.entityId !== 'profile') fail();
      const key = JSON.stringify([change.entity, change.entityId]);
      if (changedIds.has(key)) fail();
      changedIds.add(key);
      if (change.operation === 'create' && (change.before !== null || change.after === null) ||
          change.operation === 'remove' && (change.before === null || change.after !== null) ||
          change.operation === 'update' && (change.before === null || change.after === null)) fail();
      if (change.before !== null) validateSnapshot(change.before, change.entity, change.entityId);
      if (change.after !== null) validateSnapshot(change.after, change.entity, change.entityId);
    }
  }
  return state;
}

function financialValues(record, entity, truncate = false) {
  const result = {};
  for (const key of FIELDS[entity]) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value === 'string') result[key] = truncate ? clean(value) : value;
    else if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) result[key] = value;
    else fail();
  }
  return result;
}

function entityMap(state, entity) {
  if (entity === 'profile') {
    if (state.profile === undefined) return new Map();
    if (!plain(state.profile)) fail();
    return new Map([['profile', state.profile]]);
  }
  const records = state[entity] ?? [];
  if (!Array.isArray(records)) fail();
  const result = new Map();
  for (const record of records) {
    if (!plain(record) || !id(record.id) || result.has(record.id)) fail();
    result.set(record.id, record);
  }
  return result;
}

/** Call on the caller's clone before persistence; neither previous nor its log is mutated. */
export function appendAudit(previous, next, {
  action = 'Dados atualizados', idFactory = () => globalThis.crypto.randomUUID(), now = () => new Date().toISOString(),
} = {}) {
  if (previous === next) throw new Error('O histórico precisa de um estado clonado antes da atualização.');
  validateAudit(previous);
  validateAudit(next);
  const changes = [];
  let changeCount = 0;
  for (const entity of Object.keys(FIELDS)) {
    const before = entityMap(previous, entity);
    const after = entityMap(next, entity);
    const collect = (entityId, old, updated) => {
      if (old && updated && JSON.stringify(financialValues(old, entity)) === JSON.stringify(financialValues(updated, entity))) return;
      changeCount++;
      if (changes.length >= MAX_CHANGES) return;
      const record = updated || old;
      const label = record.name || record.description || entityId;
      changes.push({
        entity, entityId, name: clean(typeof label === 'string' ? label : entityId).trim() || entityId,
        operation: !old ? 'create' : !updated ? 'remove' : 'update',
        before: old ? financialValues(old, entity, true) : null,
        after: updated ? financialValues(updated, entity, true) : null,
      });
    };
    for (const [entityId, record] of before) collect(entityId, record, after.get(entityId));
    for (const [entityId, record] of after) if (!before.has(entityId)) collect(entityId, undefined, record);
  }
  if (!changes.length) return next;
  if (typeof action !== 'string' || typeof idFactory !== 'function' || typeof now !== 'function') fail();
  const event = {id: idFactory(), at: now(), action: clean(action).trim(), changes, omittedChanges: changeCount - changes.length};
  const oldLog = previous.auditLog ?? [];
  if (oldLog.some(item => item.id === event.id)) fail();
  const removed = Math.max(0, oldLog.length + 1 - MAX_EVENTS);
  const auditLog = [...structuredClone(oldLog.slice(removed)), event];
  const auditLogDropped = (previous.auditLogDropped ?? 0) + removed;
  // Validate all metadata BEFORE assigning anything to the candidate state.
  validateAudit({auditLog, auditLogDropped});
  next.auditLog = auditLog;
  next.auditLogDropped = auditLogDropped;
  return next;
}
