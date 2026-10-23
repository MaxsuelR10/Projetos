import test from 'node:test';
import assert from 'node:assert/strict';
import {createSubscriptionCalendarUI} from '../dist/ui-subscription-calendar.mjs';

function fixture() {
  let month = '2026-10', refreshes = 0;
  const state = {transactions: [], recurrences: [], subscriptions: [
    {id: 'service', name: 'Serviço <seguro>', amount: 2500, cycle: 'month', nextDate: '2026-11-01', active: true},
  ]};
  const e = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const ui = createSubscriptionCalendarUI({getState: () => state, getMonth: () => month, setMonth: value => {month = value;},
    e, currency: value => `R$ ${value}`, localDate: () => '2026-10-31', dateLabel: value => value,
    periodControl: () => '<div>Período</div>', refresh: () => {refreshes++;},
    button: (text, action, icon, classes, attrs = '') => `<button data-action="${action}" ${attrs}>${text}</button>`});
  return {state, ui, month: () => month, refreshes: () => refreshes};
}
const cells = html => [...html.matchAll(/data-action="subscription-calendar-day"/g)].length;

test('calendário apresenta 42, 7 ou 1 dia conforme o modo escolhido', () => {
  const {ui, refreshes} = fixture();
  assert.equal(cells(ui.renderCalendar()), 42);
  ui.selectMode('week'); assert.equal(cells(ui.renderCalendar()), 7);
  ui.selectMode('day'); assert.equal(cells(ui.renderCalendar()), 1);
  assert.equal(refreshes(), 2);
  assert.throws(() => ui.selectMode('year'));
});

test('semana na virada do mês inclui previsão adjacente e permite selecioná-la', () => {
  const value = fixture(); value.ui.selectMode('week');
  const html = value.ui.renderCalendar();
  assert.match(html, /1 de novembro de 2026: 1 cobrança\(s\), R\$ 2500/);
  assert.doesNotMatch(html, /data-date="2026-11-01"[^>]*disabled/);
  assert.match(html, /Próxima semana/);
  value.ui.selectDay('2026-11-01');
  assert.equal(value.month(), '2026-11');
  assert.match(value.ui.renderCalendar(), /Serviço &lt;seguro&gt;/);
  assert.match(value.ui.renderCalendar(), /Previsto · não lançado/);
});

test('navegação de mês limita dias inexistentes, e dia/semana cruzam meses', () => {
  const value = fixture(); value.ui.move(-1);
  assert.equal(value.month(), '2026-09');
  assert.match(value.ui.renderCalendar(), /data-date="2026-09-30"[^>]*aria-pressed="true"/);
  value.ui.selectDay('2026-10-31'); value.ui.selectMode('day'); value.ui.move(1);
  assert.equal(value.month(), '2026-11');
  assert.match(value.ui.renderCalendar(), /data-date="2026-11-01"[^>]*aria-pressed="true"/);
  value.ui.selectMode('week'); value.ui.move(-1);
  assert.equal(value.month(), '2026-10');
});

test('navegação e projeções não alteram finanças; entradas inválidas são rejeitadas', () => {
  const value = fixture(), original = structuredClone(value.state);
  value.ui.selectMode('week'); value.ui.renderCalendar(); value.ui.move(1); value.ui.renderCalendar();
  assert.deepEqual(value.state, original);
  assert.throws(() => value.ui.selectDay('2026-02-30'));
  assert.throws(() => value.ui.move(0.5)); assert.throws(() => value.ui.move(121));
});
