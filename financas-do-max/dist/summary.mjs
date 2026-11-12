import {accountBalance, localDate, monthlyRows, totals} from './domain.mjs';
import {invoiceFor} from './billing.mjs';

// Credit spending is counted by installment due month; invoice payments are
// excluded from spending so paying a card never counts the same purchase twice.
export function summaryFor(state, month, {accountId='', cardId='', today=localDate()}={}) {
  const throughDate=month===today.slice(0,7)?today:null;
  const recordedByCutoff=date=>!throughDate||date<=throughDate;
  const card=state.cards.find(item=>item.id===cardId);
  const scopeAccount=card?.accountId||accountId;
  const accounts=state.accounts.filter(item=>!scopeAccount||item.id===scopeAccount);
  const cards=state.cards.filter(item=>(!cardId||item.id===cardId)&&(!scopeAccount||item.accountId===scopeAccount));
  const invoices=cards.map(card=>{
    const invoice=invoiceFor(state,card,month);
    const items=invoice.items.filter(item=>recordedByCutoff(item.purchaseDate));
    const payment=invoice.payment&&recordedByCutoff(invoice.payment.date)?invoice.payment:undefined;
    return {...invoice,name:card.name,items,total:items.reduce((sum,item)=>sum+item.amount,0),payment,status:payment?'paid':'open'};
  });
  const cashRows=monthlyRows(state,month,{account:scopeAccount,basis:'cash'}).filter(item=>recordedByCutoff(item.effectiveDate));
  const cashExpenses=cardId?[]:monthlyRows(state,month,{account:scopeAccount,basis:'consumption'}).filter(item=>!item.cardId&&!item.invoicePaymentId&&item.type==='expense'&&recordedByCutoff(item.date));
  const creditExpenses=invoices.flatMap(invoice=>invoice.items.map(item=>({
    ...state.transactions.find(transaction=>transaction.id===item.transactionId),
    amount:item.amount,effectiveDate:invoice.dueDate,
    installmentIndex:item.index,installmentTotal:item.count,
  }))).filter(item=>!item.hidden);
  const rows=[...cashExpenses,...creditExpenses];
  const categories=state.categories.map(category=>({...category,total:rows.filter(item=>item.categoryId===category.id).reduce((sum,item)=>sum+item.amount,0)})).filter(item=>item.total>0).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'pt-BR'));
  const pending=cardId?0:state.transactions.filter(item=>!item.cardId&&item.type==='expense'&&item.status==='pending'&&recordedByCutoff(item.date)&&(item.dueDate||item.date).startsWith(month)&&(!scopeAccount||item.accountId===scopeAccount)).reduce((sum,item)=>sum+item.amount,0);
  return {
    accounts,cards,rows,categories,invoices,throughDate,
    invoiceTotal:invoices.reduce((sum,invoice)=>sum+invoice.total,0),
    balance:accounts.reduce((sum,item)=>sum+accountBalance(state,item.id),0),
    income:totals(cashRows,{basis:'cash'}).income,
    spending:rows.reduce((sum,item)=>sum+item.amount,0),
    payable:pending+invoices.filter(invoice=>invoice.status==='open').reduce((sum,invoice)=>sum+invoice.total,0),
    hiddenCount:state.transactions.filter(item=>item.hidden&&(!scopeAccount||item.accountId===scopeAccount)&&(!cardId||item.cardId===cardId)).length,
  };
}

export function sortSelectOptions(root) {
  for(const select of root.querySelectorAll('select')) {
    const value=select.value;
    const items=[...select.options];
    // Keep prompts such as "Todas as categorias" and "Sem cartão" first.
    items.sort((a,b)=>Number(b.value==='')-Number(a.value==='')||a.textContent.trim().localeCompare(b.textContent.trim(),'pt-BR',{sensitivity:'base',numeric:true}));
    for(const item of items)select.append(item);
    select.value=value;
  }
}
