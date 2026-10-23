import test from 'node:test';
import assert from 'node:assert/strict';
import {appendAudit, validateAudit} from '../dist/audit.mjs';

const at = '2026-10-22T12:30:00.000Z';
const options = {idFactory: () => 'audit-1', now: () => at};
const fixture = () => ({accounts: [{id: 'bank', name: 'Banco', openingBalance: 10000}], categories: [], transactions: [], cards: [], invoicePayments: [], installments: [], subscriptions: [], investments: [], recurrences: [], agents: [], profile: {name: 'Max', monthlyGoal: 1000}, messages: []});
const expense = (id = 'expense-1') => ({id, description: 'Conta', amount: 2500, type: 'expense', accountId: 'bank', date: '2026-10-22', status: 'pending'});
function recorded() {
  const previous = fixture(), next = structuredClone(previous);
  next.transactions.push(expense());
  appendAudit(previous, next, options);
  return next;
}

test('registra criação, edição e cancelamento com campos primitivos e sem tocar no original', () => {
  const previous = fixture(), untouched = structuredClone(previous), next = structuredClone(previous);
  next.transactions.push({...expense(), token: 'segredo', metadata: {private: 'não registrar'}});
  assert.equal(appendAudit(previous, next, {...options, action: 'Lançamento salvo'}), next);
  assert.deepEqual(previous, untouched);
  const created = next.auditLog[0];
  assert.equal(created.action, 'Lançamento salvo');
  assert.equal(created.at, at);
  assert.equal(created.changes[0].operation, 'create');
  assert.equal(created.changes[0].before, null);
  assert.equal(created.changes[0].after.amount, 2500);
  assert.equal(JSON.stringify(created).includes('segredo'), false);
  const edited = structuredClone(next);
  edited.transactions[0].amount = 2600;
  appendAudit(next, edited, {...options, idFactory: () => 'audit-2'});
  assert.equal(edited.auditLog[1].changes[0].before.amount, 2500);
  assert.equal(edited.auditLog[1].changes[0].after.amount, 2600);
  const cancelled = structuredClone(edited);
  cancelled.transactions[0].status = 'cancelled';
  appendAudit(edited, cancelled, {...options, idFactory: () => 'audit-3'});
  assert.equal(cancelled.auditLog[2].changes[0].after.status, 'cancelled');
  assert.equal(edited.transactions[0].status, 'pending');
  cancelled.auditLog[0].changes[0].after.amount = 999;
  assert.equal(next.auditLog[0].changes[0].after.amount, 2500);
});

test('transferência preserva origem e destino e remoção mantém somente o resumo anterior', () => {
  const previous = fixture(), next = structuredClone(previous);
  next.transactions.push({...expense(), type: 'transfer', toAccountId: 'wallet', status: 'completed', settledAt: '2026-10-22'});
  appendAudit(previous, next, options);
  assert.equal(next.auditLog[0].changes[0].after.toAccountId, 'wallet');
  const removed = structuredClone(next);
  removed.transactions = [];
  appendAudit(next, removed, {...options, idFactory: () => 'audit-2'});
  const change = removed.auditLog[1].changes[0];
  assert.equal(change.operation, 'remove');
  assert.equal(change.before.settledAt, '2026-10-22');
  assert.equal(change.after, null);
});

test('mensagens, execução de agentes, metadados secretos e reordenação não criam ruído', () => {
  const previous = recorded(), next = structuredClone(previous);
  next.messages.push({role: 'user', text: 'mensagem privada'});
  next.lastAgentRun = '2026-10-22';
  next.transactions[0].accessToken = 'não gravar';
  let calls = 0;
  appendAudit(previous, next, {idFactory: () => { calls++; throw new Error('não deveria chamar'); }});
  assert.equal(calls, 0);
  assert.deepEqual(next.auditLog, previous.auditLog);
  const reordered = fixture();
  reordered.accounts.push({id: 'wallet', name: 'Carteira', openingBalance: 0});
  const reverse = structuredClone(reordered);
  reverse.accounts.reverse();
  appendAudit(reordered, reverse, options);
  assert.equal(reverse.auditLog, undefined);
});

test('acompanha todas as famílias financeiras e cursor de recorrências sem snapshots de itens', () => {
  const previous = fixture(), next = structuredClone(previous);
  next.accounts[0].openingBalance++;
  next.categories.push({id: 'cat', name: 'Casa', budget: 200});
  next.cards.push({id: 'card', name: 'Cartão', closingDay: 3, dueDay: 23, limit: 10000});
  next.invoicePayments.push({id: 'pay', cardId: 'card', month: '2026-10', amount: 100, items: [{secret: 'omitido'}]});
  next.installments.push({id: 'plan', name: 'Compra', amount: 100, count: 2, paid: 1});
  next.subscriptions.push({id: 'sub', name: 'Serviço', amount: 100, active: true});
  next.investments.push({id: 'inv', name: 'Reserva', amount: 1000});
  next.recurrences.push({id: 'rule', name: 'Conta mensal', frequency: 'month', interval: 1, occurrencesGenerated: 2, occurrencesLimit: null, nextOccurrenceDate: '2026-12-22', endDate: null, lastGeneratedAt: '2026-10-22', subscriptionId: 'sub'});
  next.agents.push({id: 'agent', name: 'Resumo', kind: 'summary', active: true});
  next.profile.monthlyGoal++;
  next.transactions.push({...expense(), recurringTransactionId: 'rule', recurrenceDate: '2026-10-22', recurrenceOccurrence: 1, isSubscription: true, subscriptionId: 'sub'});
  appendAudit(previous, next, options);
  assert.equal(next.auditLog[0].changes.length, 11);
  assert.equal(next.auditLog[0].changes.find(change => change.entity === 'invoicePayments').after.items, undefined);
  assert.equal(next.auditLog[0].changes.find(change => change.entity === 'recurrences').after.occurrencesGenerated, 2);
  assert.equal(next.auditLog[0].changes.find(change => change.entity === 'transactions').after.recurringTransactionId, 'rule');
  assert.equal(validateAudit(next), next);
});

test('importação grande fica em 50 alterações; textos ficam em 240 e diferenças além do limite são registradas', () => {
  const previous = fixture(), next = structuredClone(previous);
  next.transactions = Array.from({length: 175}, (_, index) => ({...expense(`tx-${index}`), description: 'x'.repeat(10000)}));
  appendAudit(previous, next, {...options, action: 'A'.repeat(500)});
  const event = next.auditLog[0];
  assert.equal(event.changes.length, 50);
  assert.equal(event.omittedChanges, 125);
  assert.equal(event.action.length, 240);
  assert.equal(event.changes[0].name.length, 240);
  assert.equal(event.changes[0].after.description.length, 240);
  const edited = structuredClone(next);
  edited.transactions[0].description += ' só mudou no fim';
  appendAudit(next, edited, {...options, idFactory: () => 'audit-2'});
  assert.equal(edited.auditLog.length, 2);
});

test('retém 300 eventos, acumula descarte e não compartilha objetos com o estado anterior', () => {
  let previous = fixture();
  for (let index = 0; index < 302; index++) {
    const next = structuredClone(previous);
    next.profile.monthlyGoal++;
    appendAudit(previous, next, {...options, idFactory: () => `audit-${index}`});
    previous = next;
  }
  assert.equal(previous.auditLog.length, 300);
  assert.equal(previous.auditLog[0].id, 'audit-2');
  assert.equal(previous.auditLog.at(-1).id, 'audit-301');
  assert.equal(previous.auditLogDropped, 2);
  assert.equal(validateAudit(previous), previous);
});

test('backups legados são aceitos; metadados opcionais presentes precisam ser válidos', () => {
  const state = fixture();
  assert.equal(validateAudit(state), state);
  assert.equal(validateAudit({auditLog: [], auditLogDropped: 0}).auditLog.length, 0);
  for (const value of [null, false, {}, 'log']) assert.throws(() => validateAudit({auditLog: value}));
  for (const value of [-1, 1.1, Number.MAX_SAFE_INTEGER + 1, '1', null]) assert.throws(() => validateAudit({auditLogDropped: value}));
});

test('rejeita IDs duplicados, tempo inválido, excesso e snapshots não permitidos em backups', () => {
  const sample = recorded().auditLog[0];
  const malformed = [
    event => { event.id = ''; },
    event => { event.at = '2026-02-31T12:30:00.000Z'; },
    event => { event.action = ' '; },
    event => { event.omittedChanges = -1; },
    event => { event.changes = []; },
    event => { event.changes[0].entity = 'messages'; },
    event => { event.changes[0].operation = 'execute'; },
    event => { event.changes[0].before = {}; },
    event => { event.changes[0].after.id = 'other'; },
    event => { event.changes[0].after.amount = Infinity; },
    event => { event.changes[0].after.amount = '2500'; },
    event => { event.changes[0].after.description = 'x'.repeat(241); },
    event => { event.changes[0].after.accessToken = 'private'; },
    event => { event.changes[0].after.description = {text: 'nested'}; },
    event => { event.changes[0].name = null; },
    event => { event.changes[0].extra = true; },
    event => { event.changes.push(structuredClone(event.changes[0])); },
    event => { event.changes = Array.from({length: 51}, (_, i) => ({...structuredClone(event.changes[0]), entityId: `tx-${i}`, after: {...event.changes[0].after, id: `tx-${i}`}})); },
  ];
  for (const change of malformed) {
    const event = structuredClone(sample);
    change(event);
    assert.throws(() => validateAudit({auditLog: [event]}));
  }
  assert.throws(() => validateAudit({auditLog: [sample, structuredClone(sample)]}));
  assert.throws(() => validateAudit({auditLog: Array.from({length: 301}, (_, i) => ({...sample, id: `event-${i}`}))}));
});

test('falha ao criar evento não modifica finanças, histórico candidato ou estado original', () => {
  const previous = recorded(), original = structuredClone(previous), next = structuredClone(previous);
  next.transactions[0].amount = 2600;
  const candidate = structuredClone(next);
  for (const invalid of [
    {idFactory: () => { throw new Error('falha'); }},
    {idFactory: () => 'audit-1'},
    {idFactory: () => 'audit-2', now: () => 'invalid'},
    {idFactory: () => 'audit-2', action: ''},
  ]) {
    assert.throws(() => appendAudit(previous, next, {...options, ...invalid}));
    assert.deepEqual(next, candidate);
    assert.deepEqual(previous, original);
  }
  assert.throws(() => appendAudit(previous, previous, options), /clonado/);
});
