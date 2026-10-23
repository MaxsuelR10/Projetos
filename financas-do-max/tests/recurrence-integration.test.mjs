import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState, validateState, accountBalance} from '../dist/domain.mjs';
import {applyRecurrences} from '../dist/recurrences.mjs';
import {appendAudit} from '../dist/audit.mjs';
import {settleTransaction, cancelTransaction, restoreTransaction} from '../dist/financial-operations.mjs';

test('backup legado sem metadados novos continua aceito pelo validador completo', () => {
  const state = seedState('2026-10-22');
  delete state.recurrences; delete state.auditLog; delete state.auditLogDropped;
  assert.equal(validateState(JSON.parse(JSON.stringify(state))).version, 1);
});

test('geração, liquidação, cancelamento e restauração preservam backup e idempotência', () => {
  let state = seedState('2026-10-22'), id = 0;
  const options = {today: '2026-10-22', idFactory: () => `test-occurrence-${++id}`};
  state.recurrences.push({id: 'test-rule', name: 'Conta mensal de teste', type: 'expense', amount: 12345,
    accountId: 'bank', categoryId: 'digital', cardId: '', frequency: 'month', interval: 1,
    startDate: '2026-01-31', endDate: null, occurrencesLimit: 3, occurrencesGenerated: 0,
    nextOccurrenceDate: '2026-01-31', status: 'active', lastGeneratedAt: null});
  const before = structuredClone(state), balance = accountBalance(state, 'bank');
  assert.equal(applyRecurrences(state, '2026-10-22', options).generated, 3);
  appendAudit(before, state, {idFactory: () => 'audit-generated', now: () => '2026-10-22T12:00:00.000Z'});
  validateState(state); assert.equal(accountBalance(state, 'bank'), balance);
  const transaction = state.transactions.find(item => item.recurringTransactionId === 'test-rule');
  for (const [action, expected] of [
    [value => settleTransaction(value, transaction.id, '2026-10-22'), balance - 12345],
    [value => cancelTransaction(value, transaction.id), balance],
    [value => restoreTransaction(value, transaction.id), balance],
  ]) {
    const previous = structuredClone(state), next = structuredClone(state); action(next);
    appendAudit(previous, next, {idFactory: () => `audit-operation-${++id}`, now: () => '2026-10-22T12:00:00.000Z'});
    state = validateState(JSON.parse(JSON.stringify(next)));
    assert.equal(accountBalance(state, 'bank'), expected);
  }
  assert.equal(state.auditLog.length, 4);
  const restored = structuredClone(state);
  assert.equal(applyRecurrences(state, '2026-10-22', options).generated, 0);
  assert.deepEqual(state, restored);
});
