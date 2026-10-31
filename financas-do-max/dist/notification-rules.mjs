import {addMonth, invoiceFor} from './billing.mjs';
import {monthlyRows, totals} from './domain.mjs';

export function notificationDate(now=new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
const dayGap=(date,today)=>Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);

// Stable keys keep reloads, repeated saves and scheduled checks from repeating alerts.
export function financialNotifications(state,today=notificationDate(),{previous}={}) {
  const events=[],month=today.slice(0,7);
  const due=(key,date,label,url)=>{
    const gap=dayGap(date,today);
    if(gap<0||gap>3)return;
    const stage=gap===0?'today':'soon';
    events.push({key:`${key}:${date}:${stage}`,title:gap===0?'Vence hoje':'Vencimento próximo',message:`${label} · ${date.split('-').reverse().join('/')}`,url});
  };
  for(const card of state.cards)for(const period of [month,addMonth(month,1)]) {
    const invoice=invoiceFor(state,card,period);
    if(invoice.total>0&&!invoice.payment)due(`invoice:${card.id}`,invoice.dueDate,`Fatura de ${card.name}`,'/#/cards');
  }
  for(const t of state.transactions) {
    if(t.type!=='expense'||t.cardId||t.status!=='pending')continue;
    due(`bill:${t.id}`,t.dueDate||t.date,t.description,'/#/transactions');
    if(previous&&!previous.transactions.some(old=>old.id===t.id))events.push({key:`new-bill:${t.id}`,title:'Nova conta a pagar',message:t.description,url:'/#/transactions'});
  }
  const rows=monthlyRows(state,month,{hidden:true}).filter(t=>t.date<=today);
  const budget=(id,label,limit,expense)=>{
    if(!(limit>0)||expense<limit*.8)return;
    const level=expense>=limit?100:80;
    events.push({key:`budget:${id}:${month}:${level}`,title:level===100?'Limite mensal atingido':'Perto do limite mensal',message:`${label}: ${Math.floor(expense/limit*100)}% do orçamento utilizado.`,url:'/#/categories'});
  };
  budget('monthly','Gastos do mês',state.profile.monthlyBudget,totals(rows).expense);
  for(const c of state.categories)budget(c.id,c.name,c.budget,totals(rows.filter(t=>t.categoryId===c.id)).expense);
  return events;
}
