import {occurrenceDate, planRecurrences, applyRecurrences} from './recurrences.mjs';

const FREQUENCIES = [['day', 'Diária'], ['week', 'Semanal'], ['month', 'Mensal'], ['year', 'Anual']];
const STATUS = {active: 'Ativa', paused: 'Pausada', completed: 'Concluída'};

function moneyCents(value) {
  let input = String(value ?? '').trim().replace(/R\$\s?/g, '').replace(/\s/g, '');
  if (input.includes(',')) input = input.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) throw new Error('Informe um valor positivo com até duas casas decimais.');
  const [whole, fraction = ''] = input.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result <= 0 || result > 100_000_000_000) throw new Error('Informe um valor maior que zero e dentro do limite permitido.');
  return result;
}

export function createRecurrenceUI(ctx) {
  const {e, currency, localDate, dateLabel, field, selectField, options, selected,
    formFooter, button, badge, pageHeader, statCard, empty, $} = ctx;
  let filter = 'all';
  const dataId = id => `data-id="${e(id)}"`;
  const fullDate = date => date ? `${dateLabel(date)} ${date.slice(0, 4)}` : '—';
  const rules = state => state.recurrences || [];
  const linkedRule = (state, subscriptionId) => rules(state).find(rule => rule.subscriptionId === subscriptionId);
  const cycleLabel = rule => rule.interval === 1 ? FREQUENCIES.find(([value]) => value === rule.frequency)?.[1] || '' :
    `A cada ${rule.interval} ${{day: 'dias', week: 'semanas', month: 'meses', year: 'anos'}[rule.frequency]}`;
  const isExhausted = rule => rule.occurrencesGenerated >= 10_000 ||
    rule.occurrencesLimit !== null && rule.occurrencesGenerated >= rule.occurrencesLimit ||
    rule.endDate !== null && rule.nextOccurrenceDate > rule.endDate;

  function syncSubscription(state, rule) {
    if (!rule.subscriptionId) return;
    const subscription = state.subscriptions.find(item => item.id === rule.subscriptionId);
    if (!subscription) throw new Error('A assinatura vinculada não foi encontrada.');
    Object.assign(subscription, {
      name: rule.name, amount: rule.amount, accountId: rule.accountId, categoryId: rule.categoryId,
      cardId: rule.cardId, cycle: rule.frequency, nextDate: rule.nextOccurrenceDate,
      active: rule.status === 'active', recurrenceId: rule.id,
    });
  }

  function renderRecurrences() {
    const state = ctx.getState();
    const all = rules(state), active = all.filter(rule => rule.status === 'active');
    const paused = all.filter(rule => rule.status === 'paused');
    const upcoming = active.map(rule => rule.nextOccurrenceDate).sort()[0];
    const shown = all.filter(rule => filter === 'all' || rule.status === filter);
    const actions = button('Histórico local', 'activity', 'calendar') +
      button('Revisar lançamentos', 'generate-recurrences', 'check') +
      button('Nova recorrência', 'recurrence', 'plus', 'btn primary');
    return `${pageHeader('Sua rotina <span>no controle.</span>', 'Programe receitas e despesas, revise as ocorrências e confirme antes de gerar.', actions)}
      <div class="stats-row four">
        ${statCard('Regras ativas', active.length, 'repeat', 'Geração sempre confirmada por você')}
        ${statCard('Regras pausadas', paused.length, 'calendar', 'Nenhum lançamento gerado enquanto pausadas')}
        ${statCard('Ocorrências processadas', all.reduce((sum, rule) => sum + rule.occurrencesGenerated, 0), 'check', 'Inclui duplicidades ignoradas')}
        ${statCard('Próxima ocorrência', e(fullDate(upcoming)), 'calendar', 'Entre as regras ativas')}
      </div>
      <div class="notice">Recorrências em conta geram pendências, sem alterar o saldo. No crédito, geram compras de uma parcela e comprometem o limite. Nada é executado ao abrir esta tela.</div>
      <div class="filters-bar"><label class="field"><span>Mostrar regras</span><select id="recurrence-filter">
        ${[['all', 'Todas'], ['active', 'Ativas'], ['paused', 'Pausadas'], ['completed', 'Concluídas']].map(([value, label]) => `<option value="${value}" ${selected(value, filter)}>${label}</option>`).join('')}
      </select></label><span class="muted">${shown.length} de ${all.length} regra(s)</span></div>
      <div class="recurrence-grid">${shown.map(rule => {
        const card = state.cards.find(item => item.id === rule.cardId);
        const category = state.categories.find(item => item.id === rule.categoryId);
        const controls = button('Editar regra', 'recurrence', 'edit', 'btn', dataId(rule.id)) +
          (rule.status === 'completed' ? '<span class="badge">Encerrada; crie uma nova regra para continuar</span>' :
            button(rule.status === 'active' ? 'Pausar' : 'Retomar', 'toggle-recurrence', 'repeat', 'btn', dataId(rule.id))) +
          button('Ver lançamentos', 'recurrence-transactions', 'arrow', 'btn', dataId(rule.id));
        return `<section class="panel recurrence-card">
          <div class="card-heading">${badge(STATUS[rule.status], rule.status === 'active' ? 'soft' : '')}${badge(rule.type === 'income' ? 'Receita' : card ? 'Compra no crédito' : 'Despesa')}</div>
          <h3>${e(rule.name)}</h3><p class="muted">${e(cycleLabel(rule))} · ${e(ctx.acct(rule.accountId).name)}</p>
          <div class="recurrence-amount ${rule.type === 'income' ? 'positive' : ''}">${currency(rule.amount)}<small>por ocorrência</small></div>
          <p class="muted">${e(category?.name || 'Sem categoria')}${card ? ` · ${e(card.name)}` : ''}${rule.subscriptionId ? ' · Assinatura vinculada' : ''}</p>
          <div class="recurrence-details"><p><span>Próxima data-base</span><strong>${e(fullDate(rule.nextOccurrenceDate))}</strong></p>
            <p><span>Processadas</span><strong>${rule.occurrencesGenerated}${rule.occurrencesLimit ? ` / ${rule.occurrencesLimit}` : ''}</strong></p>
            ${rule.endDate ? `<p><span>Data final</span><strong>${e(fullDate(rule.endDate))}</strong></p>` : ''}</div>
          <div class="recurrence-actions">${controls}</div></section>`;
      }).join('') || empty(all.length ? 'Nenhuma regra neste filtro' : 'Planeje o que se repete', all.length ? 'Escolha outro status para consultar suas regras.' : 'Cadastre aluguel, salário ou serviços recorrentes e revise antes de gerar.', all.length ? '' : 'recurrence', 'Nova recorrência')}</div>`;
  }

  function recurrenceModal(id = '', subscriptionId = '') {
    const state = ctx.getState();
    const existing = rules(state).find(rule => rule.id === id);
    if (id && !existing) throw new Error('A recorrência não foi encontrada.');
    if (subscriptionId && !existing) {
      const linked = linkedRule(state, subscriptionId);
      if (linked) return recurrenceModal(linked.id);
    }
    const subscription = state.subscriptions.find(item => item.id === (existing?.subscriptionId || subscriptionId));
    if (subscriptionId && !subscription) throw new Error('A assinatura não foi encontrada.');
    if (!state.accounts.length || !state.categories.length) {
      ctx.openModal('Antes de programar', '<p>Cadastre pelo menos uma conta e uma categoria antes de criar recorrências.</p>');
      return;
    }
    const accountId = existing?.accountId || subscription?.accountId || ctx.getAccount() || state.accounts[0].id;
    const categoryId = existing?.categoryId || subscription?.categoryId ||
      (subscription ? state.categories.find(item => item.id === 'digital')?.id : '') || state.categories[0].id;
    const draft = existing || {
      name: subscription?.name || '', type: 'expense', amount: subscription?.amount || 0,
      accountId, categoryId, cardId: subscription?.cardId || '', frequency: subscription?.cycle || 'month',
      interval: 1, startDate: subscription?.nextDate || localDate(), endDate: null, occurrencesLimit: null,
      occurrencesGenerated: 0, status: subscription?.active === false ? 'paused' : 'active',
    };
    const linked = Boolean(existing?.subscriptionId || subscription);
    const frozen = Boolean(existing?.occurrencesGenerated);
    const ended = existing?.status === 'completed';
    const disabled = frozen ? 'disabled' : '';
    const frequencyChoices = FREQUENCIES.filter(([value]) => !linked || ['month', 'year'].includes(value));
    const availableCards = state.cards.filter(card => card.accountId === accountId);
    ctx.openModal(existing ? 'Editar recorrência' : linked ? 'Programar assinatura' : 'Nova recorrência', `<form id="recurrence-form">
      ${!existing&&!linked&&state.profile.salary>0?`<button class="btn" type="button" id="use-profile-salary">Usar salário do perfil · ${currency(state.profile.salary)}</button><p class="hint">Preenche uma receita mensal. Confira a conta e a data de recebimento antes de salvar.</p>`:''}
      ${field('Descrição','name',draft.name,'text','required maxlength="100"')}
      <div class="form-grid">
        ${selectField('Tipo', 'type', (linked ? [['expense', 'Despesa']] : [['expense', 'Despesa'], ['income', 'Receita']]).map(([value, label]) => `<option value="${value}" ${selected(value, draft.type)}>${label}</option>`).join(''), linked ? 'disabled' : '')}
        ${field('Valor por ocorrência (R$)', 'amount', draft.amount ? String(draft.amount / 100).replace('.', ',') : '', 'text', 'required inputmode="decimal"')}
        ${selectField('Conta', 'accountId', options(state.accounts, accountId), 'required')}
        ${selectField('Categoria', 'categoryId', options(state.categories, categoryId), 'required')}
        ${selectField('Cartão (opcional)', 'cardId', '<option value="">Sem cartão · pendência em conta</option>' + options(availableCards, draft.cardId), draft.type === 'income' ? 'disabled' : '')}
        ${selectField('Frequência', 'frequency', frequencyChoices.map(([value, label]) => `<option value="${value}" ${selected(value, draft.frequency)}>${label}</option>`).join(''), disabled)}
        ${field('Repetir a cada', 'interval', draft.interval, 'number', `required min="1" max="120" step="1" ${frozen || linked ? 'disabled' : ''}`)}
        ${field('Primeira ocorrência', 'startDate', draft.startDate, 'date', `required ${disabled}`)}
        ${field('Data final (opcional)', 'endDate', draft.endDate || '', 'date')}
        ${field('Total de ocorrências (opcional)', 'occurrencesLimit', draft.occurrencesLimit ?? '', 'number', `min="${Math.max(1, draft.occurrencesGenerated)}" max="10000" step="1"`)}
        ${selectField('Situação', 'status', (ended ? [['completed', 'Concluída']] : [['active', 'Ativa'], ['paused', 'Pausada']]).map(([value, label]) => `<option value="${value}" ${selected(value, draft.status)}>${label}</option>`).join(''), ended ? 'disabled' : '')}
      </div>
      ${linked ? '<p class="hint">Esta regra controla a assinatura vinculada. Nome, valor, conta, frequência e próxima data serão sincronizados, sem criar cobrança em dobro.</p>' : ''}
      ${frozen ? '<p class="hint">O calendário inicial está protegido porque já há ocorrências processadas. Valor, conta e categoria novos valem apenas para ocorrências futuras; os lançamentos existentes não serão reescritos.</p>' : ''}
      ${ended ? '<p class="notice">Esta regra foi concluída e permanecerá encerrada. Para continuar a programação, crie uma nova recorrência.</p>' : ''}
      <p class="hint">Salvar cria somente a regra. Para gerar lançamentos, use “Revisar lançamentos” e confirme a prévia. Pendências em conta só alteram saldo quando você registrar a liquidação.</p>
      ${formFooter('Salvar regra')}</form>`, {wide: true, onSubmit: form => {
        const currentState = ctx.getState();
        const current = id ? rules(currentState).find(rule => rule.id === id) : null;
        if (id && !current) throw new Error('A recorrência foi removida. Feche e abra novamente.');
        const currentLink = current?.subscriptionId || subscription?.id;
        if (!current && currentLink && linkedRule(currentState, currentLink)) throw new Error('Esta assinatura já possui uma regra. Feche e abra a regra vinculada.');
        const locked = Boolean(current?.occurrencesGenerated);
        const next = {
          ...current, id: current?.id || ctx.uid(), name: String(form.get('name') || '').trim(),
          type: currentLink ? 'expense' : String(form.get('type') || ''), amount: moneyCents(form.get('amount')),
          accountId: String(form.get('accountId') || ''), categoryId: String(form.get('categoryId') || ''),
          cardId: String(form.get('cardId') || ''), frequency: locked ? current.frequency : String(form.get('frequency') || ''),
          interval: locked ? current.interval : currentLink ? 1 : Number(form.get('interval')),
          startDate: locked ? current.startDate : String(form.get('startDate') || ''),
          endDate: String(form.get('endDate') || '') || null,
          occurrencesLimit: String(form.get('occurrencesLimit') || '') ? Number(form.get('occurrencesLimit')) : null,
          occurrencesGenerated: current?.occurrencesGenerated || 0,
          lastGeneratedAt: current?.lastGeneratedAt || null,
          status: current?.status === 'completed' ? 'completed' : String(form.get('status') || ''),
          ...(currentLink ? {subscriptionId: currentLink} : {}),
        };
        if (next.type === 'income') next.cardId = '';
        next.nextOccurrenceDate = occurrenceDate(next, next.occurrencesGenerated);
        if (next.endDate && next.endDate < next.startDate) throw new Error('A data final não pode ser anterior à primeira ocorrência.');
        if (next.occurrencesGenerated && next.endDate && next.endDate < occurrenceDate(next, next.occurrencesGenerated - 1)) throw new Error('A data final não pode apagar ocorrências já processadas.');
        if (next.occurrencesLimit !== null && (!Number.isSafeInteger(next.occurrencesLimit) || next.occurrencesLimit < Math.max(1, next.occurrencesGenerated) || next.occurrencesLimit > 10_000)) throw new Error('O limite deve ser inteiro entre as ocorrências já processadas e 10.000.');
        if (isExhausted(next)) next.status = 'completed';
        ctx.commit(value => {
          value.recurrences ||= [];
          const index = value.recurrences.findIndex(rule => rule.id === next.id);
          if (current) value.recurrences[index] = next; else value.recurrences.push(next);
          syncSubscription(value, next);
        }, 'Regra salva. Nenhum lançamento foi gerado automaticamente.');
        ctx.closeModal();
      }});
    const formNode = $('#recurrence-form');
    formNode?.querySelector('#use-profile-salary')?.addEventListener('click',()=>{
      const set=(name,value)=>{const input=formNode.querySelector(`[name="${name}"]`);if(input)input.value=value;};
      set('name','Salário');set('type','income');set('amount',currency(ctx.getState().profile.salary));set('frequency','month');set('interval','1');
      formNode.querySelector('[name="type"]')?.dispatchEvent(new Event('change'));
    });
    const refreshCards = () => {
      const type = formNode?.querySelector('[name="type"]')?.value;
      const selectedAccount = formNode?.querySelector('[name="accountId"]')?.value;
      const cardNode = formNode?.querySelector('[name="cardId"]');
      if (!cardNode) return;
      const available = ctx.getState().cards.filter(card => card.accountId === selectedAccount);
      const choice = available.some(card => card.id === cardNode.value) ? cardNode.value : '';
      cardNode.innerHTML = '<option value="">Sem cartão · pendência em conta</option>' + options(available, choice);
      cardNode.disabled = type !== 'expense';
      if (cardNode.disabled) cardNode.value = '';
    };
    formNode?.querySelector('[name="type"]')?.addEventListener('change', refreshCards);
    formNode?.querySelector('[name="accountId"]')?.addEventListener('change', refreshCards);
  }

  function generationModal() {
    const today = localDate();
    ctx.openModal('Revisar recorrências', `<form>
      <p>Escolha até qual data quer revisar. A prévia não salva nem gera lançamentos.</p>
      ${field('Gerar ocorrências até', 'through', today, 'date', `required max="${e(today)}"`)}
      <div class="notice">Somente regras ativas e datas até hoje. Pendências não debitam contas; compras no cartão comprometem limite. Ocorrências futuras e cobranças já registradas não serão geradas novamente.</div>
      <p class="hint">O limite é de 1.000 ocorrências por lote. Para períodos grandes, comece por uma data anterior.</p>
      ${formFooter('Ver prévia')}</form>`, {onSubmit: form => showGenerationPreview(String(form.get('through') || ''))});
  }

  function showGenerationPreview(through) {
    const plan = planRecurrences(ctx.getState(), through, {today: localDate()});
    const fingerprint = JSON.stringify(plan.rows);
    const visible = plan.rows.slice(0, 100);
    const canApply = Boolean(plan.rows.length || plan.updates.length);
    ctx.openModal('Confirmar ocorrências', `<form>
      <p>Período até <strong>${e(fullDate(through))}</strong>. Esta prévia ainda não alterou os seus dados.</p>
      <div class="stats-row">${statCard('Novos lançamentos', plan.newCount, 'plus', 'Pendências em conta ou compras no cartão')}${statCard('Já registrados', plan.existingCount, 'check', 'Ignorados sem duplicar ou alterar registros')}</div>
      <div class="generation-preview-list">${visible.map(row => `<div class="generation-preview-row">
        <div><strong>${e(row.name)}</strong><small>${e(fullDate(row.date))} · ${e(ctx.acct(row.accountId).name)} · ${row.type === 'income' ? 'Receita' : row.cardId ? 'Crédito' : 'Despesa'}</small></div>
        <div><strong>${currency(row.amount)}</strong>${badge(row.status === 'existing' ? 'Já registrado' : row.cardId ? 'Nova compra' : 'Nova pendência', row.status === 'new' ? 'soft' : '')}</div>
      </div>`).join('') || '<p class="muted">Nenhuma ocorrência pendente de processamento neste período.</p>'}</div>
      ${plan.rows.length > visible.length ? `<p class="hint">Exibindo ${visible.length} de ${plan.rows.length} ocorrências. A confirmação processará todas as ${plan.rows.length}, incluindo as duplicidades ignoradas.</p>` : `<p class="hint">${plan.rows.length} ocorrência(s) na prévia completa.</p>`}
      <div class="notice">Ocorrências em conta ficam pendentes até você registrar o recebimento ou pagamento. No cartão, são compras reais no controle local. O sistema confere novamente duplicatas e faturas pagas antes de salvar tudo de uma vez.</div>
      ${canApply ? '<label class="toggle-label"><input type="checkbox" name="confirm" value="yes" required> Revisei a prévia e confirmo o processamento deste lote.</label>' : ''}
      <div class="recurrence-actions">${button('Refazer prévia', 'generate-recurrences', 'repeat', 'btn', 'type="button"')}</div>
      ${canApply ? formFooter('Confirmar e gerar') : `<div class="form-footer">${button('Fechar', 'close-modal', '', 'btn', 'type="button"')}</div>`}</form>`, {wide: true, onSubmit: form => {
        if (!canApply || form.get('confirm') !== 'yes') throw new Error('Confirme que você revisou a prévia antes de continuar.');
        let result;
        ctx.commit(value => {
          const fresh = planRecurrences(value, through, {today: localDate()});
          if (JSON.stringify(fresh.rows) !== fingerprint) throw new Error('Os dados mudaram desde a prévia. Use “Refazer prévia” para revisar novamente.');
          result = applyRecurrences(value, through, {today: localDate(), idFactory: ctx.uid});
        }, 'Ocorrências revisadas e processadas.');
        ctx.closeModal();
        ctx.toast(`${result.generated} lançamento(s) gerado(s); ${result.existingCount} duplicidade(s) ignorada(s).`);
      }});
  }

  function toggleRecurrence(id) {
    const current = rules(ctx.getState()).find(rule => rule.id === id);
    if (!current) throw new Error('A recorrência não foi encontrada.');
    if (current.status === 'completed' || isExhausted(current)) throw new Error('Esta regra foi concluída. Crie uma nova recorrência para continuar.');
    const nextStatus = current.status === 'active' ? 'paused' : 'active';
    ctx.commit(value => {
      const rule = rules(value).find(item => item.id === id);
      rule.status = nextStatus;
      syncSubscription(value, rule);
    }, nextStatus === 'paused' ? 'Recorrência pausada. Lançamentos existentes foram preservados.' : 'Recorrência retomada. Revise os lançamentos antes de gerar.');
    return true;
  }

  function toggleSubscription(id) {
    const state = ctx.getState();
    const linked = linkedRule(state, id);
    if (linked) return toggleRecurrence(linked.id);
    const subscription = state.subscriptions.find(item => item.id === id);
    if (!subscription) throw new Error('A assinatura não foi encontrada.');
    ctx.commit(value => {
      const item = value.subscriptions.find(subscription => subscription.id === id);
      item.active = !item.active;
    }, subscription.active ? 'Assinatura pausada.' : 'Assinatura ativada.');
    return true;
  }

  function editLinkedSubscription(id) {
    const rule = linkedRule(ctx.getState(), id);
    if (!rule) return false;
    recurrenceModal(rule.id);
    return true;
  }

  function subscriptionButtons(id) {
    const rule = linkedRule(ctx.getState(), id);
    return rule ? button('Editar regra vinculada', 'recurrence', 'edit', 'btn full', dataId(rule.id)) :
      button('Programar lançamentos', 'subscription-recurrence', 'repeat', 'btn full', dataId(id));
  }

  function bindControls() {
    $('#recurrence-filter')?.addEventListener('change', event => {
      const value = event.target.value;
      if (!['all', 'active', 'paused', 'completed'].includes(value)) return;
      filter = value;
      ctx.render();
    });
  }

  return {renderRecurrences, recurrenceModal, generationModal, toggleRecurrence, toggleSubscription,
    editLinkedSubscription, subscriptionButtons, bindControls};
}
