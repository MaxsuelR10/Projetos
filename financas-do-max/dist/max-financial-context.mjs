import {financialReport,accountBalance,pendingExpenses,shiftMonth,findDuplicates,installmentSummary,assistantReply,currency} from './domain.mjs';
import {creditInstallmentPlans,validMonth} from './billing.mjs';

// Shared calculations: the model receives computed facts, never a raw bank statement.
export function maxFinancialContext(state,month){
  if(!validMonth(month))throw new Error('Escolha um mês válido.');
  const cash=financialReport(state,month,{basis:'cash'});
  const consumption=financialReport(state,month,{basis:'consumption'});
  const previous=financialReport(state,shiftMonth(month,-1),{basis:'consumption'});
  const plans=installmentSummary([...state.installments,...creditInstallmentPlans(state)]);
  const subscriptions=state.subscriptions.filter(x=>x.active);
  const monthlySubscriptions=subscriptions.reduce((sum,x)=>sum+(x.cycle==='year'?Math.round(x.amount/12):x.amount),0);
  const money=value=>({centavos:value,BRL:currency(value)});
  const summary=report=>({receitas:money(report.summary.income),despesas:money(report.summary.expense),resultado:money(report.summary.balance),lancamentos:report.rows.length});
  return {
    mes:month,moeda:'BRL',base:'Registros manuais da conta autenticada; não são saldos consultados nos bancos.',
    caixa:{...summary(cash),criterio:'Somente valores liquidados; cartão entra no caixa ao pagar a fatura.'},
    consumo:{...summary(consumption),criterio:'Compras pela data do lançamento; pagamento da fatura não soma a despesa novamente.'},
    mesAnterior:{mes:shiftMonth(month,-1),consumo:summary(previous)},
    saldoRegistradoEmContas:money(state.accounts.reduce((sum,a)=>sum+accountBalance(state,a.id),0)),
    pendenciasDoMes:money(pendingExpenses(state,month)),
    categorias:consumption.categories.filter(c=>c.total>0||c.budget>0).slice(0,20).map(c=>({nome:c.name,gasto:money(c.total),orcamento:money(c.budget)})),
    categoriasLimitadasA:20,
    assinaturas:{ativas:subscriptions.length,equivalenteMensal:money(monthlySubscriptions)},
    parcelas:{comprasEmAndamento:plans.count,compromissoMensal:money(plans.monthly),restante:money(plans.remaining)},
    possiveisDuplicidades:findDuplicates(consumption.rows).length,
    perfil:{salarioInformado:money(state.profile.salary||0),metaEconomia:money(state.profile.monthlyGoal||0)},
    limites:'Salário informado e meta não movimentam saldo. Pendências, parcelas e assinaturas podem se sobrepor; não somar tudo como dívida. Duplicidades são indícios. Sem cotação, internet, Open Finance ou dados futuros.'
  };
}

export function localMaxReply(state,month,message){
  return assistantReply(state,month,message);
}
