import {randomUUID} from 'node:crypto';
import {validateState,normalize,accountBalance,currency,financialReport} from './dist/domain.mjs';
import {assertPurchaseAllowed,assertPurchaseEditable,validCivilDate,invoiceFor} from './dist/billing.mjs';
import {cancelTransaction} from './dist/financial-operations.mjs';
import {appendAudit} from './dist/audit.mjs';
import {intentSchema,reais,resolveDate} from './assistant-intents.mjs';

function resolve(rows,name,message,label){
  const matches=rows.filter(x=>name?normalize(x.name)===normalize(name):normalize(message).includes(normalize(x.name)));
  if(matches.length===1)return matches[0];
  if(name||matches.length>1)throw new Error(`Selecione ${label} existente sem ambiguidade.`);
  return null;
}
function categoryFor(state,intent,message){
  const exact=resolve(state.categories,intent.categoryName,message,'uma categoria');if(exact)return exact;
  const n=normalize(message);
  const aliases=/gasolina|abastec|combustivel/.test(n)?['combustivel','transporte']: /mercado/.test(n)?['supermercado','alimentacao']: /internet/.test(n)?['internet','servicos','moradia']: /salario/.test(n)?['salario','receitas','outros']: /tenis|roupa|comprei/.test(n)?['compras']:[];
  for(const alias of aliases){const rows=state.categories.filter(c=>normalize(c.name).includes(alias));if(rows.length===1)return rows[0];}
  const keywords=state.categories.filter(c=>c.keywords.some(k=>k&&n.includes(normalize(k))));
  if(keywords.length===1)return keywords[0];
  throw new Error('Escolha a categoria existente na prévia.');
}
export function prepareOperation(state,raw,message,today){
  const intent=intentSchema.parse(raw);
  if(!['create_transaction','update_transaction','delete_transaction'].includes(intent.intent))throw new Error('Descreva um lançamento com valor, conta e categoria.');
  let transaction;
  if(intent.intent==='create_transaction'){
    const card=resolve(state.cards,intent.cardName,message,'um cartão');
    const namedAccount=resolve(state.accounts,intent.accountName,message,'uma conta');
    const account=namedAccount||(card?state.accounts.find(a=>a.id===card.accountId):state.accounts.length===1?state.accounts[0]:null);
    if(!account)throw new Error('Escolha em qual conta registrar o lançamento.');
    if(card&&card.accountId!==account.id)throw new Error('O cartão pertence a outra conta.');
    if((intent.installments||1)>1&&!card)throw new Error('Escolha o cartão para a compra parcelada.');
    const category=categoryFor(state,intent,message),date=resolveDate(intent.date,today);
    if(!validCivilDate(date))throw new Error('Informe a data no formato AAAA-MM-DD.');
    if(!['income','expense'].includes(intent.type))throw new Error('Escolha receita ou despesa.');
    transaction={id:randomUUID(),description:intent.description?.trim()||message,amount:reais(intent.amount),date,type:intent.type,accountId:account.id,categoryId:category.id,cardId:card?.id||'',hidden:false,status:'completed',source:'assistant',assistantCreatedAt:new Date().toISOString(),...(card?{installmentCount:intent.installments||1}:{settledAt:date})};
    assertPurchaseAllowed(state,transaction);
  }else{
    let candidates;
    if(intent.target==='last_expense')candidates=state.transactions.filter(t=>t.type==='expense'&&t.source==='assistant'&&t.status!=='cancelled').sort((a,b)=>(b.assistantCreatedAt||'').localeCompare(a.assistantCreatedAt||'')).slice(0,1);
    else {const key=value=>normalize(value).replace(/abastecimento|abasteci/g,'abastec');candidates=state.transactions.filter(t=>t.status!=='cancelled'&&intent.target&&key(t.description).includes(key(intent.target)));}
    if(candidates.length!==1)throw new Error('Não encontrei um único lançamento. Informe uma descrição mais específica.');
    transaction={...candidates[0]};
    if(transaction.invoicePaymentId||transaction.recurringTransactionId||transaction.subscriptionId||transaction.type==='transfer')throw new Error('Este lançamento vinculado deve ser alterado na tela correspondente.');
    assertPurchaseEditable(state,transaction.id);
    if(intent.intent==='update_transaction')transaction.amount=reais(intent.amount);
  }
  const operation={intent:intent.intent,transaction};
  applyOperation(state,operation); // Full financial validation also runs before preview.
  return operation;
}
export function applyOperation(state,operation){
  const next=structuredClone(state),t=operation.transaction;
  if(operation.intent==='create_transaction'){
    if(next.transactions.some(x=>x.id===t.id))throw new Error('Operação já aplicada.');
    assertPurchaseAllowed(next,t);next.transactions.push(t);
  }else{
    const index=next.transactions.findIndex(x=>x.id===t.id);if(index<0)throw new Error('Lançamento não encontrado.');
    assertPurchaseEditable(next,t.id);
    if(operation.intent==='delete_transaction')cancelTransaction(next,t.id);
    else{next.transactions[index]=t;assertPurchaseAllowed(next,t);}
  }
  appendAudit(state,next,{action:'Assistente: '+operation.intent});validateState(next);return next;
}
export function previewOperation(state,operation){
  const t=operation.transaction;
  return {action:operation.intent,description:t.description,amount:t.amount,date:t.date,type:t.type,account:state.accounts.find(x=>x.id===t.accountId)?.name,category:state.categories.find(x=>x.id===t.categoryId)?.name,card:state.cards.find(x=>x.id===t.cardId)?.name||null,installments:t.installmentCount||1,transactionId:t.id};
}
export const financialTools={
  listAccounts:s=>s.accounts.map(({id,name})=>({id,name})),listCategories:s=>s.categories.map(({id,name})=>({id,name})),listCards:s=>s.cards.map(({id,name})=>({id,name})),
  listTransactions:(s,m)=>financialReport(s,m,{basis:'consumption'}).rows,
  getMonthlySummary:(s,m)=>financialReport(s,m,{basis:'consumption'}).summary,
  getAccountBalance:s=>s.accounts.map(a=>({name:a.name,amount:accountBalance(s,a.id)})),
  getCategoryExpenses:(s,m)=>financialReport(s,m,{basis:'consumption'}).categories,
  createTransaction:applyOperation,updateTransaction:applyOperation,deleteTransaction:applyOperation,createInstallmentPurchase:applyOperation
};
export function queryReply(state,intent,message,month){
  const report=financialReport(state,month,{basis:'consumption'});
  switch(intent.query){
    case 'balance':return financialTools.getAccountBalance(state).map(a=>`${a.name}: ${currency(a.amount)}`).join('\n');
    case 'category':{const c=categoryFor(state,intent,message);const amount=report.categories.find(x=>x.id===c.id)?.total||0;return `${c.name} em ${month}: ${currency(amount)}.`;}
    case 'largest':return report.rows.filter(t=>t.type==='expense').sort((a,b)=>b.amount-a.amount).slice(0,5).map(t=>`${t.description}: ${currency(t.amount)}`).join('\n')||'Nenhuma despesa neste mês.';
    case 'cards':return state.cards.map(c=>`${c.name}: ${currency(invoiceFor(state,c,month).total)}`).join('\n')||'Nenhum cartão cadastrado.';
    case 'accounts':return state.accounts.map(x=>x.name).join(', ');
    case 'categories':return state.categories.map(x=>x.name).join(', ');
    case 'transactions':return report.rows.slice(0,20).map(t=>`${t.date} · ${t.description}: ${currency(t.amount)}`).join('\n')||'Nenhum lançamento.';
    default:return `Em ${month}: receitas ${currency(report.summary.income)}, despesas ${currency(report.summary.expense)}, resultado ${currency(report.summary.balance)}. Base: consumo.`;
  }
}
