import test from 'node:test';
import assert from 'node:assert/strict';
import {occurrenceDate, validateRecurrences, planRecurrences, applyRecurrences} from '../dist/recurrences.mjs';
import {accountBalance} from '../dist/domain.mjs';
import {registerInvoicePayment} from '../dist/billing.mjs';

const today = '2026-10-22';
const rule = overrides => ({
  id: 'rule', name: 'Aluguel', type: 'expense', amount: 10001,
  accountId: 'bank', categoryId: 'home', cardId: '', frequency: 'month', interval: 1,
  startDate: '2026-08-31', endDate: null, occurrencesLimit: null, occurrencesGenerated: 0,
  nextOccurrenceDate: '2026-08-31', status: 'active', lastGeneratedAt: null, ...overrides,
});
const state = (rules = [rule()]) => ({
  accounts: [{id: 'bank', openingBalance: 100000}], categories: [{id: 'home'}],
  cards: [{id: 'card', name: 'Cartão', accountId: 'bank', closingDay: 20, dueDay: 25, limit: 100000}],
  transactions: [], subscriptions: [], invoicePayments: [], recurrences: rules,
});
const ids = () => { let index = 0; return () => `generated-${++index}`; };
const generate = (value, through = today, options = {}) => applyRecurrences(value, through, {today, idFactory: ids(), ...options});

test('monthly dates preserve original anchor through February, including intervals', () => {
  const monthly = rule({startDate: '2026-01-31'});
  assert.deepEqual([0, 1, 2, 3].map(index => occurrenceDate(monthly, index)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.equal(occurrenceDate({...monthly, interval: 2}, 2), '2026-05-31');
});

test('yearly leap dates preserve February 29 on the next leap year', () => {
  const yearly = rule({frequency: 'year', startDate: '2024-02-29'});
  assert.deepEqual([0, 1, 2, 4].map(index => occurrenceDate(yearly, index)), ['2024-02-29', '2025-02-28', '2026-02-28', '2028-02-29']);
});

test('civil daily/weekly dates cross year and leap day independently of DST', () => {
  assert.equal(occurrenceDate(rule({frequency: 'day', startDate: '2024-02-28'}), 2), '2024-03-01');
  assert.equal(occurrenceDate(rule({frequency: 'week', interval: 2, startDate: '2026-12-25'}), 1), '2027-01-08');
  for (const mutate of [item => item.startDate = '2026-02-30', item => item.frequency = 'fortnight', item => item.interval = 0]) {
    const item = rule(); mutate(item); assert.throws(() => occurrenceDate(item, 0));
  }
  assert.throws(() => occurrenceDate(rule(), -1));
  assert.throws(() => occurrenceDate(rule({startDate: '9999-12-31', frequency: 'day'}), 1));
});

test('preview is pure, uses cents, and does not generate future slots', () => {
  const value = state(); const before = structuredClone(value);
  const plan = planRecurrences(value, today, {today});
  assert.deepEqual(value, before);
  assert.deepEqual(plan.rows.map(item => item.date), ['2026-08-31', '2026-09-30']);
  assert.equal(plan.rows.reduce((sum, item) => sum + item.amount, 0), 20002);
  assert.equal(plan.newCount, 2);
  assert.equal(plan.updates[0].nextOccurrenceDate, '2026-10-31');
  assert.equal(plan.updates[0].lastGeneratedAt, today);
  assert.throws(() => planRecurrences(value, '2026-10-23', {today}), /futuras/);
});

test('limit and end are inclusive and finish finite rules', () => {
  const limited = state([rule({occurrencesLimit: 1})]);
  const result = generate(limited);
  assert.equal(result.generated, 1);
  assert.equal(limited.recurrences[0].status, 'completed');
  assert.equal(limited.recurrences[0].occurrencesGenerated, 1);
  const ended = state([rule({endDate: '2026-09-30'})]);
  assert.equal(generate(ended).generated, 2);
  assert.equal(ended.recurrences[0].status, 'completed');
  assert.equal(ended.recurrences[0].nextOccurrenceDate, '2026-10-31');
});

test('pause and already completed rules never advance or generate', () => {
  for (const status of ['paused', 'completed']) {
    const value = state([rule({status})]);
    assert.deepEqual(planRecurrences(value, today, {today}), {rows: [], updates: [], newCount: 0, existingCount: 0});
    assert.equal(generate(value).generated, 0);
    assert.equal(value.recurrences[0].occurrencesGenerated, 0);
  }
});

test('batch limit covers all due slots globally, including duplicate skips', () => {
  const value = state([rule({frequency: 'day', startDate: '2026-10-20', nextOccurrenceDate: '2026-10-20'})]);
  const before = structuredClone(value);
  assert.throws(() => generate(value, today, {maxBatch: 2}), /lotes menores/);
  assert.deepEqual(value, before);
  assert.equal(generate(value, today, {maxBatch: 3}).generated, 3);
  assert.throws(() => planRecurrences(value, today, {today, maxBatch: 0}), /lote/);
});

test('cash recurrence creates pending rows and never changes real balances', () => {
  for (const type of ['income', 'expense']) {
    const value = state([rule({type})]);
    const balance = accountBalance(value, 'bank');
    assert.equal(generate(value).generated, 2);
    assert.equal(accountBalance(value, 'bank'), balance);
    for (const [index, transaction] of value.transactions.entries()) {
      assert.equal(transaction.status, 'pending');
      assert.equal(transaction.dueDate, transaction.date);
      assert.equal(transaction.source, 'recurrence');
      assert.equal(transaction.recurringTransactionId, 'rule');
      assert.equal(transaction.recurrenceDate, transaction.date);
      assert.equal(transaction.recurrenceOccurrence, index);
      assert.equal(transaction.settledAt, undefined);
    }
  }
});

test('repeated generation is idempotent and never regenerates cancelled own rows', () => {
  const value = state();
  generate(value);
  value.transactions[0].status = 'cancelled';
  const before = structuredClone(value);
  assert.equal(generate(value).generated, 0);
  assert.deepEqual(value, before);
  const restored = JSON.parse(JSON.stringify(value));
  assert.equal(validateRecurrences(restored), restored);
});

test('exact manual duplicates skip conservatively without adoption or overwriting', () => {
  const value = state();
  value.transactions.push({id: 'manual', description: '  ÁLUGUEL  ', amount: 10001, type: 'expense',
    accountId: 'bank', categoryId: 'home', cardId: '', date: '2026-08-31', status: 'completed'});
  const manual = structuredClone(value.transactions[0]);
  const preview = planRecurrences(value, today, {today});
  assert.equal(preview.existingCount, 1); assert.equal(preview.newCount, 1);
  const result = generate(value);
  assert.equal(result.generated, 1);
  assert.deepEqual(value.transactions[0], manual);
  assert.equal(value.recurrences[0].occurrencesGenerated, 2);
  assert.equal(value.transactions[1].recurrenceOccurrence, 1);
  assert.equal(generate(value).generated, 0);
});

test('cancelled manual rows and financially different manual rows do not suppress new slots', () => {
  for (const extra of [{status: 'cancelled'}, {amount: 1}, {type: 'income'}, {cardId: 'card'}, {date: '2026-08-30'}, {description: 'Outro aluguel'}]) {
    const value = state([rule({occurrencesLimit: 1})]);
    value.transactions.push({id: 'manual', description: 'Aluguel', amount: 10001, type: 'expense', accountId: 'bank', cardId: '', date: '2026-08-31', status: 'completed', ...extra});
    assert.equal(generate(value).generated, 1);
  }
});

test('matching invoice payment cash debits also suppress a duplicate pending obligation', () => {
  const value = state([rule({name: 'Pagamento de fatura', occurrencesLimit: 1})]);
  value.transactions.push({id: 'invoice-payment', description: 'Pagamento de fatura', amount: 10001,
    date: '2026-08-31', settledAt: '2026-08-31', type: 'expense', status: 'completed',
    accountId: 'bank', categoryId: 'home', cardId: '', invoicePaymentId: 'invoice-payment', source: 'invoice'});
  const before = structuredClone(value.transactions);
  const plan = planRecurrences(value, today, {today});
  assert.equal(plan.newCount, 0); assert.equal(plan.existingCount, 1);
  assert.equal(generate(value).generated, 0);
  assert.deepEqual(value.transactions, before);
  assert.equal(value.recurrences[0].occurrencesGenerated, 1);
  assert.equal(value.recurrences[0].status, 'completed');
});

test('distinct rules with identical financial details keep their own occurrence identities', () => {
  const value = state([rule({id: 'rent-a', occurrencesLimit: 1}), rule({id: 'rent-b', occurrencesLimit: 1})]);
  const plan = planRecurrences(value, today, {today});
  assert.equal(plan.newCount, 2); assert.equal(plan.existingCount, 0);
  assert.equal(generate(value).generated, 2);
  assert.deepEqual(value.transactions.map(item => item.recurringTransactionId), ['rent-a', 'rent-b']);
  assert.equal(new Set(value.transactions.map(item => item.id)).size, 2);
  assert.equal(generate(value).generated, 0);
});

test('credit rules create a completed single installment without moving cash', () => {
  const value = state([rule({cardId: 'card', occurrencesLimit: 1})]);
  assert.equal(generate(value).generated, 1);
  const transaction = value.transactions[0];
  assert.equal(transaction.status, 'completed');
  assert.equal(transaction.installmentCount, 1);
  assert.equal(transaction.cardId, 'card');
  assert.equal(transaction.settledAt, undefined);
  assert.equal(accountBalance(value, 'bank'), 100000);
});

test('a paid invoice refuses the entire batch before any mutation', () => {
  const value = state([rule({id: 'cash', occurrencesLimit: 1}), rule({cardId: 'card', occurrencesLimit: 1})]);
  value.transactions.push({id: 'old-purchase', description: 'Compra antiga', amount: 500, date: '2026-08-31',
    type: 'expense', status: 'completed', cardId: 'card', accountId: 'bank', categoryId: 'home', installmentCount: 1});
  registerInvoicePayment(value, {cardId: 'card', month: '2026-09', accountId: 'bank', date: '2026-09-25', id: 'payment'});
  const before = structuredClone(value);
  assert.throws(() => generate(value), /fatura já paga/);
  assert.deepEqual(value, before);
});

test('ID generator failures, invalid IDs, and collisions roll back all rules and transactions', () => {
  for (const idFactory of [() => '', () => 'bank', () => 'same', (() => { let calls = 0; return () => { if (++calls === 2) throw new Error('generator failed'); return 'first'; }; })()]) {
    const value = state(); const before = structuredClone(value);
    assert.throws(() => generate(value, today, {idFactory}));
    assert.deepEqual(value, before);
  }
  const value = state();
  value.transactions.push({id: 'existing', date: '2026-01-01'});
  assert.throws(() => generate(value, today, {idFactory: () => 'existing'}), /duplicado/);
});

test('subscription links update their projection but do not create a second charge', () => {
  const value = state([rule({subscriptionId: 'subscription', occurrencesLimit: 1})]);
  value.subscriptions.push({id: 'subscription', name: 'Nome antigo', amount: 1, accountId: 'bank', cycle: 'year', nextDate: '2026-08-31', active: true});
  assert.equal(generate(value).generated, 1);
  assert.deepEqual(value.subscriptions[0], {id: 'subscription', name: 'Aluguel', amount: 10001, accountId: 'bank', categoryId: 'home', cycle: 'month', nextDate: '2026-09-30', active: false});
  assert.equal(value.transactions.length, 1);
});

test('old backups without recurrences are accepted unless they contain orphan links', () => {
  const value = state(); delete value.recurrences;
  assert.equal(validateRecurrences(value), value);
  value.transactions.push({id: 'orphan', recurringTransactionId: 'missing'});
  assert.throws(() => validateRecurrences(value), /vínculo/);
});

test('rule validation rejects malformed IDs, references, values, dates and cursors', () => {
  const invalid = [
    item => item.id = '', item => item.name = '', item => item.amount = 0, item => item.amount = 1.1,
    item => item.amount = Number.MAX_SAFE_INTEGER, item => item.accountId = 'missing', item => item.categoryId = 'missing',
    item => item.cardId = 'missing', item => { item.cardId = 'card'; item.type = 'income'; },
    item => item.interval = 121, item => item.frequency = 'quarter', item => item.startDate = '2026-02-29',
    item => item.endDate = '2026-08-30', item => item.nextOccurrenceDate = '2026-09-01',
    item => item.occurrencesGenerated = -1, item => item.occurrencesLimit = 0,
    item => item.status = 'disabled', item => item.lastGeneratedAt = today,
    item => item.subscriptionId = 'missing',
  ];
  for (const mutate of invalid) {
    const value = state(); mutate(value.recurrences[0]);
    assert.throws(() => validateRecurrences(value));
  }
  const duplicate = state(); duplicate.recurrences.push({...duplicate.recurrences[0]});
  assert.throws(() => validateRecurrences(duplicate), /duplicado/);
  const missing = state(); missing.recurrences = {};
  assert.throws(() => validateRecurrences(missing), /Lista/);
  missing.recurrences = null;
  assert.throws(() => validateRecurrences(missing), /Lista/);
});

test('generated backup links require unique dates, valid rule, date and zero-based index below cursor', () => {
  const value = state(); generate(value);
  assert.equal(validateRecurrences(value), value);
  const invalid = [
    copy => copy.transactions[0].recurringTransactionId = 'unknown',
    copy => copy.transactions[0].recurrenceDate = '2026-08-30',
    copy => copy.transactions[0].date = '2026-08-30',
    copy => copy.transactions[0].recurrenceOccurrence = 2,
    copy => copy.transactions[0].source = 'manual',
    copy => copy.transactions.push({...copy.transactions[0], id: 'duplicate'}),
    copy => copy.transactions[1].id = copy.transactions[0].id,
    copy => { copy.recurrences[0].occurrencesGenerated = 1; copy.recurrences[0].nextOccurrenceDate = '2026-09-30'; },
    copy => copy.recurrences[0].lastGeneratedAt = null,
    copy => copy.recurrences[0].lastGeneratedAt = '2026-08-01',
  ];
  for (const mutate of invalid) {
    const copy = structuredClone(value); mutate(copy);
    assert.throws(() => validateRecurrences(copy));
  }
});

test('subscription references allow only a unique monthly/yearly interval-one expense', () => {
  for (const extra of [{frequency: 'day'}, {interval: 2}, {type: 'income'}]) {
    const value = state([rule({subscriptionId: 'sub', ...extra})]);
    value.subscriptions.push({id: 'sub'});
    assert.throws(() => validateRecurrences(value), /assinatura/);
  }
  const value = state([rule({subscriptionId: 'sub'}), rule({id: 'rule-2', subscriptionId: 'sub'})]);
  value.subscriptions.push({id: 'sub'});
  assert.throws(() => validateRecurrences(value), /assinatura/);
});

test('catch-up can run in bounded date windows without losing anchors or duplicating slots', () => {
  const value = state([rule({frequency: 'day', startDate: '2026-10-01', nextOccurrenceDate: '2026-10-01', occurrencesLimit: 22})]);
  const factory = ids();
  for (const through of ['2026-10-07', '2026-10-14', '2026-10-21', today]) {
    applyRecurrences(value, through, {today, idFactory: factory, maxBatch: 7});
  }
  assert.equal(value.transactions.length, 22);
  assert.equal(new Set(value.transactions.map(item => item.recurrenceDate)).size, 22);
  assert.equal(value.recurrences[0].nextOccurrenceDate, '2026-10-23');
  assert.equal(value.recurrences[0].status, 'completed');
  assert.equal(value.transactions.reduce((sum, item) => sum + item.amount, 0), 220022);
});
