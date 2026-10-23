import {subscriptionCalendar} from './subscription-calendar.mjs';
import {addMonth, civilDate, validCivilDate, validMonth} from './billing.mjs';

const MODES = [['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês']];
const WEEKDAYS = [['Seg', 'Segunda-feira'], ['Ter', 'Terça-feira'], ['Qua', 'Quarta-feira'], ['Qui', 'Quinta-feira'], ['Sex', 'Sexta-feira'], ['Sáb', 'Sábado'], ['Dom', 'Domingo']];
const utcDate = date => new Date(`${date}T12:00:00.000Z`);
const dateId = date => `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
const shiftDay = (date, delta) => {
  const value = utcDate(date);
  value.setUTCDate(value.getUTCDate() + delta);
  return dateId(value);
};
const monday = date => shiftDay(date, -((utcDate(date).getUTCDay() + 6) % 7));
const formatDate = (date, options) => utcDate(date).toLocaleDateString('pt-BR', {timeZone: 'UTC', ...options});

/** Browser-only view state. Projection rows are never turned into payments here. */
export function createSubscriptionCalendarUI(ctx) {
  const {getState, getMonth, setMonth, e, currency, localDate, dateLabel, periodControl, button, refresh} = ctx;
  let selectedDate = localDate();
  let mode = 'month';

  function syncMonth() {
    const month = getMonth();
    if (!validMonth(month)) throw new Error('Mês do calendário inválido.');
    if (!validCivilDate(selectedDate) || selectedDate.slice(0, 7) !== month) selectedDate = `${month}-01`;
    return month;
  }

  function selectMode(value) {
    if (!MODES.some(([key]) => key === value)) throw new Error('Visualização do calendário inválida.');
    syncMonth();
    mode = value;
    refresh();
  }

  function selectDay(date) {
    if (!validCivilDate(date)) throw new Error('Dia do calendário inválido.');
    selectedDate = date;
    if (getMonth() !== date.slice(0, 7)) setMonth(date.slice(0, 7));
    refresh();
  }

  function move(delta) {
    syncMonth();
    if (!Number.isSafeInteger(delta) || Math.abs(delta) > 120) throw new Error('Navegação do calendário inválida.');
    const next = mode === 'month'
      ? civilDate(addMonth(selectedDate.slice(0, 7), delta), Number(selectedDate.slice(8)))
      : shiftDay(selectedDate, delta * (mode === 'week' ? 7 : 1));
    selectDay(next);
  }

  function renderCalendar() {
    const month = syncMonth();
    const start = mode === 'month' ? monday(`${month}-01`) : mode === 'week' ? monday(selectedDate) : selectedDate;
    const dates = Array.from({length: mode === 'month' ? 42 : mode === 'week' ? 7 : 1}, (_, index) => shiftDay(start, index));
    const months = mode === 'week' ? [...new Set(dates.map(date => date.slice(0, 7)))] : [month];
    const events = months.flatMap(value => subscriptionCalendar(getState(), value));
    const eventsByDay = new Map();
    for (const event of events) {
      if (!eventsByDay.has(event.date)) eventsByDay.set(event.date, []);
      eventsByDay.get(event.date).push(event);
    }
    const selectedEvents = eventsByDay.get(selectedDate) || [];
    const selectedEligible = selectedEvents.filter(event => event.status !== 'cancelled');
    const selectedTotal = selectedEligible.reduce((sum, event) => sum + event.amount, 0);
    const projected = selectedEligible.filter(event => event.projection || event.status === 'scheduled').length;
    const periodLabel = mode === 'month'
      ? formatDate(`${month}-01`, {month: 'long', year: 'numeric'})
      : mode === 'week' ? `${dateLabel(start)} a ${dateLabel(shiftDay(start, 6))} · ${month.slice(0, 4)}`
        : formatDate(selectedDate, {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
    const periodName = mode === 'month' ? 'mês' : mode === 'week' ? 'semana' : 'dia';

    const dayCell = date => {
      const outside = mode === 'month' && date.slice(0, 7) !== month;
      const daily = (eventsByDay.get(date) || []).filter(event => event.status !== 'cancelled');
      const total = daily.reduce((sum, event) => sum + event.amount, 0);
      const label = `${formatDate(date, {day: 'numeric', month: 'long', year: 'numeric'})}: ${outside ? 'fora do mês selecionado' : `${daily.length} cobrança(s), ${currency(total)}`}`;
      return `<button type="button" class="subscription-day${date === selectedDate ? ' selected' : ''}${outside ? ' outside' : ''}" data-action="subscription-calendar-day" data-date="${e(date)}" aria-label="${e(label)}" aria-pressed="${date === selectedDate}"${outside ? ' disabled' : ''}>
        <time datetime="${e(date)}">${Number(date.slice(8))}</time>
        ${outside ? '<small class="calendar-empty">Outro mês</small>' : daily.length ? `<small class="calendar-count">${daily.length}<span class="calendar-count-label"> cobrança${daily.length === 1 ? '' : 's'}</span></small><strong title="${e(currency(total))}"><span class="calendar-full-money">${e(currency(total))}</span><span class="calendar-compact-money" aria-hidden="true">${e(currency(total).replace(/^R\$\s*/, ''))}</span></strong>` : '<small class="calendar-empty">Sem cobranças</small>'}
      </button>`;
    };
    const eventCard = event => {
      const status = event.projection || event.status === 'scheduled' ? 'Previsto · não lançado'
        : event.status === 'cancelled' ? 'Cancelado · fora dos totais'
          : event.status === 'pending' ? 'Pendente · registrado no controle' : 'Concluído · registro local';
      const targetId = event.transactionId || event.subscriptionId;
      const action = event.transactionId ? 'transaction' : 'subscription';
      return `<article class="subscription-event${event.status === 'cancelled' ? ' cancelled' : ''}">
        <div><strong>${e(event.name)}</strong><small>${e(status)}</small></div>
        <strong>${e(currency(event.amount))}</strong>
        ${targetId ? button(event.transactionId ? 'Ver lançamento' : 'Ver assinatura', action, '', 'btn small', `data-id="${e(targetId)}"`) : ''}
      </article>`;
    };

    return `<section class="panel subscription-calendar" aria-label="Calendário de assinaturas">
      <div class="card-heading"><div><h2>Calendário de assinaturas</h2><p class="muted">Cobranças previstas e lançamentos vinculados, dia a dia.</p></div>${periodControl()}</div>
      <div class="calendar-view-switch" role="group" aria-label="Visualização do calendário">${MODES.map(([key, label]) => button(label, 'subscription-calendar-mode', '', `btn${mode === key ? ' active' : ''}`, `data-mode="${key}" aria-pressed="${mode === key}"`)).join('')}</div>
      <div class="calendar-day-navigation">
        ${button('Anterior', 'subscription-calendar-prev', 'chevron', 'btn', `aria-label="${e(`${periodName} anterior`)}"`)}
        <strong aria-live="polite">${e(periodLabel)}</strong>
        ${button('Próximo', 'subscription-calendar-next', 'chevron', 'btn', `aria-label="${e(`${mode === 'week' ? 'Próxima' : 'Próximo'} ${periodName}`)}"`)}
      </div>
      <div class="subscription-calendar-layout">
        <div>
          ${mode === 'day' ? '' : `<div class="subscription-weekdays" aria-hidden="true">${WEEKDAYS.map(([short, full]) => `<span title="${full}">${short}</span>`).join('')}</div>`}
          <div class="subscription-calendar-grid${mode === 'day' ? ' day-mode' : ''}" role="group" aria-label="Dias do calendário">${dates.map(dayCell).join('')}</div>
        </div>
        <section class="subscription-day-details" aria-label="Detalhes do dia selecionado">
          <div class="card-heading"><h3>${e(formatDate(selectedDate, {day: 'numeric', month: 'long'}))}</h3><strong>${e(currency(selectedTotal))}</strong></div>
          <p class="muted">${selectedEligible.length} cobrança(s) · ${projected} prevista(s) · ${selectedEligible.length - projected} lançamento(s). Canceladas ficam fora do total.</p>
          ${selectedEvents.length ? selectedEvents.map(eventCard).join('') : '<p class="muted">Nenhuma cobrança prevista ou registrada neste dia.</p>'}
        </section>
      </div>
      <p class="hint">Previsões não alteram o saldo. Usam a próxima cobrança informada e as regras de recorrência; não representam um histórico completo de cobranças.</p>
    </section>`;
  }

  return {renderCalendar, selectMode, selectDay, move};
}
