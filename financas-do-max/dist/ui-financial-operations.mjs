import {settleTransaction, cancelTransaction, restoreTransaction, markSubscription} from './financial-operations.mjs';
import {hasPaidPurchase, civilDate, addMonth} from './billing.mjs';

export function createFinancialOperationsUI(ctx) {
  const {getState,commit,e,currency,localDate,dateLabel,openModal,closeModal,field,selectField,options,formFooter,button,pageHeader,empty,uid}=ctx;
  let historyPage=1;
  function toolbar(id){
    const state=getState(),row=state.transactions.find(item=>item.id===id);if(!row)return '';
    const protectedRow=row.invoicePaymentId||hasPaidPurchase(state,id),actions=[];
    if(!protectedRow){
      if(row.status==='pending'&&!row.cardId)actions.push(button(row.type==='income'?'Registrar recebimento':'Registrar pagamento','transaction-settle','check','btn small',`data-id="${e(id)}"`));
      actions.push(row.status==='cancelled'?button(row.cardId?'Restaurar compra no cartão':'Restaurar como pendente','transaction-restore','repeat','btn small',`data-id="${e(id)}"`):button(row.type==='transfer'?'Estornar transferência':'Cancelar lançamento','transaction-cancel','close','btn small',`data-id="${e(id)}"`));
    }
    if(row.subscriptionId)actions.push(button('Ver assinatura','subscription','calendar','btn small',`data-id="${e(row.subscriptionId)}"`));
    else if(row.type==='expense'&&!row.invoicePaymentId&&row.status!=='cancelled'&&!(row.installmentCount>1))actions.push(button('Identificar assinatura','transaction-subscription','repeat','btn small',`data-id="${e(id)}"`));
    return actions.length?`<div class="transaction-operations">${actions.join('')}</div>`:'';
  }
  function operationModal(id,operation){
    const row=getState().transactions.find(item=>item.id===id);if(!row)throw new Error('Lançamento não encontrado.');
    const title=operation==='settle'?(row.type==='income'?'Registrar recebimento':'Registrar pagamento'):operation==='restore'?'Restaurar lançamento':row.type==='transfer'?'Estornar transferência no controle':'Cancelar lançamento';
    const explanation=operation==='settle'?'A conta será atualizada uma única vez, pela data de liquidação escolhida.':operation==='restore'?'O registro em conta voltará como pendente, sem alterar saldo. Compras de cartão voltam à fatura quando permitido.':'O registro será preservado como cancelado, sem efeito no saldo ou compromisso. A alteração aparecerá no histórico.';
    openModal(title,`<p><strong>${e(row.description)}</strong> · ${currency(row.amount)}</p><p class="muted">${explanation} Isto altera apenas o controle local: não executa nem desfaz operações no banco.</p><form>${operation==='settle'?field('Data da liquidação','date',localDate(),'date',`required max="${localDate()}"`):''}<label class="check-label"><input type="checkbox" required> Confirmo esta alteração no meu controle.</label>${formFooter(title)}</form>`,{onSubmit:form=>{
      if(operation==='settle'&&form.get('date')>localDate())throw new Error('A liquidação não pode estar no futuro.');
      const message=operation==='settle'?(row.type==='income'?'Recebimento registrado.':'Pagamento registrado.'):operation==='restore'?'Lançamento restaurado.':row.type==='transfer'?'Transferência estornada no controle.':'Lançamento cancelado no controle.';
      commit(current=>{if(operation==='settle')settleTransaction(current,id,form.get('date'));else if(operation==='restore')restoreTransaction(current,id);else cancelTransaction(current,id);},message);closeModal();
    }});
  }
  function markSubscriptionModal(id){
    const state=getState(),row=state.transactions.find(item=>item.id===id);if(!row)throw new Error('Lançamento não encontrado.');
    openModal('Identificar assinatura',`<p class="muted">Classificar este gasto não cria outro débito e não ativa cobranças automáticas.</p><form>${selectField('Vincular serviço existente (opcional)','subscriptionId','<option value="">Criar novo acompanhamento</option>'+options(state.subscriptions,''))}${field('Nome do serviço','name',row.description.slice(0,100),'text','required maxlength="100"')}${selectField('Frequência do serviço','cycle','<option value="month">Mensal</option><option value="year">Anual</option>')}${field('Próxima cobrança prevista','nextDate',civilDate(addMonth(row.date.slice(0,7),1),Number(row.date.slice(8))),'date','required')}${formFooter('Identificar assinatura')}</form>`,{onSubmit:form=>{
      commit(current=>markSubscription(current,{transactionId:id,subscriptionId:form.get('subscriptionId'),id:uid(),name:form.get('name'),cycle:form.get('cycle'),nextDate:form.get('nextDate')}),'Assinatura identificada sem duplicar o gasto.');closeModal();
    }});
  }
  const labels={amount:'Valor',openingBalance:'Saldo de abertura',status:'Situação',date:'Data do lançamento',settledAt:'Data de liquidação',name:'Nome',description:'Descrição',accountId:'Conta',toAccountId:'Conta de destino',categoryId:'Categoria',cardId:'Cartão',nextOccurrenceDate:'Próxima ocorrência',occurrencesGenerated:'Ocorrências processadas',frequency:'Frequência',nextDate:'Próxima cobrança',active:'Ativa',budget:'Orçamento',limit:'Limite',recurringTransactionId:'Recorrência',subscriptionId:'Assinatura',isSubscription:'Classificada como assinatura'};
  const entityLabels={transactions:'Lançamentos',accounts:'Contas',categories:'Categorias',cards:'Cartões',invoicePayments:'Pagamentos de fatura',installments:'Parcelamentos',subscriptions:'Assinaturas',recurrences:'Recorrências',investments:'Investimentos',agents:'Regras locais',profile:'Perfil'};
  function renderActivity(){
    const state=getState(),logs=[...(state.auditLog||[])].reverse(),size=20;historyPage=Math.min(historyPage,Math.max(1,Math.ceil(logs.length/size)));
    const operationLabel={create:'Criado',update:'Alterado',remove:'Removido'};
    const value=(key,item)=>{
      if(item===null||item===undefined)return '—';
      if(typeof item==='boolean')return item?'Sim':'Não';
      if(['amount','openingBalance','limit','budget','monthlyGoal'].includes(key)&&typeof item==='number')return currency(item);
      if(key==='status')return {active:'Ativa',paused:'Pausada',completed:'Concluído',pending:'Pendente',cancelled:'Cancelado'}[item]||String(item);
      if(['frequency','cycle'].includes(key))return {day:'Diária',week:'Semanal',month:'Mensal',year:'Anual'}[item]||String(item);
      if(key==='type')return {income:'Receita',expense:'Despesa',transfer:'Transferência'}[item]||String(item);
      return String(item);
    };
    return `${pageHeader('Seu histórico, <span>com clareza.</span>','Alterações registradas neste navegador. Não é um log imutável de servidor.',button('Exportar backup completo','backup','download'))}<div class="notice">${logs.length} evento(s) retido(s). Últimos 300 eventos, até 50 mudanças por evento. ${state.auditLogDropped||0} evento(s) antigo(s) descartado(s) pelo limite. Não há auditoria retroativa dos dados anteriores a esta versão.</div><div class="audit-list">${logs.slice((historyPage-1)*size,historyPage*size).map(log=>`<section class="panel audit-event"><div class="card-heading"><h3>${e(log.action)}</h3><time datetime="${e(log.at)}">${e(new Date(log.at).toLocaleString('pt-BR'))}</time></div>${log.changes.map(change=>`<details><summary><span>${e(operationLabel[change.operation])} · ${e(change.name||change.entityId)}</span><small>${e(entityLabels[change.entity]||change.entity)}</small></summary><div class="audit-change-table"><div><strong>Campo</strong><span>Antes</span><span>Depois</span></div>${[...new Set([...Object.keys(change.before||{}),...Object.keys(change.after||{})])].filter(key=>JSON.stringify(change.before?.[key])!==JSON.stringify(change.after?.[key])).map(key=>`<div><strong>${e(labels[key]||key)}</strong><span>${e(value(key,change.before?.[key]))}</span><span>${e(value(key,change.after?.[key]))}</span></div>`).join('')}</div></details>`).join('')}${log.omittedChanges?`<p class="hint">${log.omittedChanges} mudança(s) adicionais não detalhadas pelo limite de tamanho.</p>`:''}</section>`).join('')||empty('Nenhuma alteração registrada','As próximas operações financeiras aparecerão aqui.','','')}<div class="table-footer">${button('Anterior','audit-prev','','btn small',historyPage<=1?'disabled':'')}<span>Página ${historyPage} de ${Math.max(1,Math.ceil(logs.length/size))}</span>${button('Próxima','audit-next','','btn small',historyPage*size>=logs.length?'disabled':'')}</div></div>`;
  }
  function moveHistory(delta){historyPage=Math.max(1,historyPage+delta);ctx.render();}
  return {toolbar,operationModal,markSubscriptionModal,renderActivity,moveHistory};
}
