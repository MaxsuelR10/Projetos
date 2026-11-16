import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState,parseCSV,accountBalance,validateState} from '../dist/domain.mjs';
import {previewCsvImport,buildCsvImport,csvCardCorrectionCandidates,planCsvCardCorrection} from '../dist/csv-import.mjs';
import {invoiceFor,registerInvoicePayment} from '../dist/billing.mjs';
import {summaryFor} from '../dist/summary.mjs';
test('fatura Nubank registra despesas no cartão, mantém saldo e evita duplicatas',()=>{
 const s=seedState('2026-10-01');s.transactions=[];s.invoicePayments=[];const c=s.cards[0];c.closingDay=3;c.dueDay=23;const csv='date,category,title,amount\n2026-10-02,Alimentação,Restaurante,10.50\n2026-10-01,Outros,Mercado,20.00';
 const rows=parseCSV(csv,{cardInvoice:true}), before=accountBalance(s,c.accountId);assert.equal(rows[0].type,'expense');const p=previewCsvImport(s,rows,c.accountId,c.id,'2026-10');assert.equal(p.rows[0].categoryId,s.categories.find(x=>x.name==='Alimentação').id);const result=buildCsvImport(s,rows,c.accountId,[0,1],(()=>{let i=0;return()=>`new${++i}`})(),c.id,'2026-10');s.transactions.push(...result.transactions);validateState(s);assert.equal(accountBalance(s,c.accountId),before);assert.equal(invoiceFor(s,c,'2026-10').total,3050);assert.equal(previewCsvImport(s,rows,c.accountId,c.id,'2026-10').duplicateCount,2);assert.throws(()=>previewCsvImport(s,rows,c.accountId,c.id,'2026-11'),/ciclo/);assert.throws(()=>parseCSV('date,title,amount\n2026-10-01,Pagamento,-20',{cardInvoice:true}),/pagamento ou estorno/);
});

test('pagamento recebido é ignorado; estornos continuam exigindo revisão',()=>{const csv='date,title,amount\n2026-10-01,Pagamento recebido,-100.00\n2026-10-02,Compra,12.00';const rows=parseCSV(csv,{cardInvoice:true});assert.equal(rows.length,1);assert.equal(rows.skippedPayments,1);assert.equal(rows[0].type,'expense');assert.throws(()=>parseCSV('date,title,amount\n2026-10-01,Estorno,-10.00',{cardInvoice:true}),/estorno/);});

const month='2026-11',today='2026-11-16';
function importedAsAccount(){
  const state=seedState('2026-10-22');
  const category={id:'fuel-test',name:'Combustível',icon:'⛽',budget:0,keywords:[]};
  const nubank={...state.cards[0],id:'nubank',name:'Nubank',closingDay:16,dueDay:20};
  const inter={...nubank,id:'inter',name:'Inter',closingDay:6,dueDay:12};
  state.cards=[nubank,inter];
  state.categories.push(category);
  state.invoicePayments=[];
  const expense=(id,date,amount,cardId='')=>({
    id,date,amount,cardId,description:id,accountId:nubank.accountId,categoryId:category.id,
    type:'expense',status:'completed',settledAt:date,source:cardId?'manual':'csv',hidden:false
  });
  state.transactions=[
    expense('nubank-outubro','2026-10-22',15000),
    expense('nubank-novembro','2026-11-03',2500),
    expense('inter-outubro','2026-10-26',10000,'inter'),
    expense('fora-do-ciclo','2026-11-16',500),
    {...expense('cancelada','2026-10-25',300),status:'cancelled'},
    {...expense('pagamento','2026-10-25',300),description:'Pagamento recebido'}
  ];
  return {state,nubank,inter,category};
}

test('vincula as compras CSV existentes pelo ciclo, corrige caixa e categorias e preserva histórico após a quitação',()=>{
  const {state,nubank,inter,category}=importedAsAccount();
  const original=structuredClone(state);
  const getSummary=()=>summaryFor(state,month,{today});
  const fuel=()=>getSummary().categories.find(row=>row.id===category.id).total;
  const ids=csvCardCorrectionCandidates(state,nubank,month).map(row=>row.id);
  assert.deepEqual(ids,['nubank-outubro','nubank-novembro']);
  assert.deepEqual(getSummary().invoices.map(row=>row.cardId),[inter.id]);
  assert.equal(fuel(),13000); // R$ 100 Inter, R$ 25 Nubank ainda em conta e R$ 5 fora do ciclo.

  const plan=planCsvCardCorrection(state,{ids,cardId:nubank.id,month});
  assert.deepEqual(state,original);
  assert.equal(plan.accountAfter-plan.accountBefore,17500);
  assert.equal(plan.invoiceBefore.total,0);
  assert.equal(plan.invoiceAfter.remainingAmount,17500);
  assert.deepEqual(plan.transactions.map(row=>row.id),original.transactions.map(row=>row.id));
  state.transactions=plan.transactions;
  assert.ok(state.transactions.filter(row=>ids.includes(row.id)).every(row=>row.cardId===nubank.id&&row.categoryId===category.id&&!row.settledAt));
  assert.equal(csvCardCorrectionCandidates(state,nubank,month).length,0);
  assert.deepEqual(getSummary().invoices.map(row=>[row.cardId,row.remainingAmount]),[[nubank.id,17500],[inter.id,10000]]);
  assert.equal(fuel(),28000);
  assert.equal(summaryFor(state,'2026-10',{today,cardId:nubank.id}).spending,0);

  registerInvoicePayment(state,{cardId:nubank.id,accountId:nubank.accountId,date:today,month,id:'pay-nubank'});
  validateState(state);
  assert.deepEqual(getSummary().invoices.map(row=>row.cardId),[inter.id]);
  assert.equal(fuel(),28000);
  const historical=invoiceFor(state,nubank,month,today);
  assert.equal(historical.status,'paid');
  assert.equal(historical.payments.length,1);
  assert.equal(historical.items.length,2);
});

test('a correção protege o ciclo, compras duplicadas e faturas quitadas',()=>{
  const {state,nubank}=importedAsAccount();
  const plan=(...ids)=>planCsvCardCorrection(state,{ids,cardId:nubank.id,month});
  assert.throws(()=>plan('nubank-outubro','fora-do-ciclo'),/fora do ciclo/);
  const existing={...state.transactions[0],id:'compra-já-vinculada',cardId:nubank.id};
  state.transactions.push(existing);
  assert.throws(()=>plan('nubank-outubro'),/duplicada/);
  registerInvoicePayment(state,{cardId:nubank.id,accountId:nubank.accountId,date:today,month,id:'pay-nubank'});
  const paid=structuredClone(state);
  assert.throws(()=>plan('nubank-novembro'),/já foi paga/);
  assert.deepEqual(state,paid);
});
