import test from 'node:test';
import assert from 'node:assert/strict';
import {summaryFor,sortSelectOptions} from '../dist/summary.mjs';
import {seedState,parseCSV,validateState,accountBalance} from '../dist/domain.mjs';
import {registerInvoicePayment} from '../dist/billing.mjs';
import {applyCsvType,previewCsvImport,buildCsvImport,planCsvTypeCorrection} from '../dist/csv-import.mjs';

function fixture(){
  const s=seedState('2026-10-22');s.transactions=[];s.invoicePayments=[];
  s.cards=[{id:'nubank',name:'Nubank',accountId:'bank',limit:1000000,closingDay:3,dueDay:23},{id:'inter',name:'Inter',accountId:'wallet',limit:1000000,closingDay:3,dueDay:23}];
  const add=(id,amount,categoryId,extra={})=>s.transactions.push({id,amount,categoryId,description:id,type:'expense',date:'2026-10-02',status:'completed',accountId:'bank',...extra});
  add('n-food',9000,'food',{cardId:'nubank',installmentCount:3});
  add('n-market',5000,'market',{cardId:'nubank'});
  add('i-market',7000,'market',{cardId:'inter',accountId:'wallet'});
  add('cash',2000,'food');add('pending',4000,'home',{status:'pending'});
  add('income',50000,'other',{type:'income'});
  add('cancelled',99999,'other',{status:'cancelled'});
  return s;
}

test('Resumo reúne contas e cartões e filtra parcelas e categorias sem contar o pagamento duas vezes',()=>{
  const s=fixture(),original=structuredClone(s);
  const all=summaryFor(s,'2026-10');
  assert.equal(all.spending,21000);assert.equal(all.income,50000);assert.equal(all.payable,19000);
  assert.deepEqual(all.categories.map(c=>[c.id,c.total]),[['market',12000],['food',5000],['home',4000]]);
  const nubank=summaryFor(s,'2026-10',{cardId:'nubank'}),inter=summaryFor(s,'2026-10',{cardId:'inter'});
  assert.equal(nubank.spending,8000);assert.equal(nubank.payable,8000);assert.equal(nubank.accounts.length,1);
  assert.equal(inter.spending,7000);assert.equal(inter.income,0);
  assert.equal(summaryFor(s,'2026-10',{accountId:'bank'}).spending,14000);
  assert.equal(summaryFor(s,'2026-11',{cardId:'nubank'}).spending,3000);
  assert.deepEqual(s,original);
  registerInvoicePayment(s,{cardId:'nubank',month:'2026-10',accountId:'bank',date:'2026-10-23',id:'payment'});
  const after=summaryFor(s,'2026-10');
  assert.equal(after.spending,all.spending);assert.equal(after.payable,11000);assert.equal(after.balance,all.balance-8000);
  validateState(s);
});

test('ocultar afeta o gráfico, preserva saldo e cobrança e continua recuperável',()=>{
  const s=fixture(),before=summaryFor(s,'2026-10');
  s.transactions.find(t=>t.id==='n-market').hidden=true;
  const after=summaryFor(s,'2026-10');
  assert.equal(after.spending,before.spending-5000);assert.equal(after.balance,before.balance);assert.equal(after.payable,before.payable);assert.equal(after.hiddenCount,1);
});

test('faturas do mês atual somam dois cartões por vencimento e incluem compras até hoje',()=>{
  const s=fixture();
  s.cards[1].closingDay=18;
  const purchase=(id,card,date,amount,extra={})=>({
    id,description:id,cardId:card.id,accountId:card.accountId,date,amount,
    categoryId:'food',type:'expense',status:'completed',...extra,
  });
  const [nubank,inter]=s.cards;
  s.transactions=[
    purchase('outubro-nubank',nubank,'2026-10-28',10000),
    purchase('novembro-nubank',nubank,'2026-11-02',2000,{hidden:true}),
    purchase('outubro-inter',inter,'2026-10-20',5000),
    purchase('hoje-inter',inter,'2026-11-12',3000),
    purchase('futura-inter',inter,'2026-11-13',4000),
    purchase('vence-dezembro',nubank,'2026-11-04',9000),
  ];
  registerInvoicePayment(s,{cardId:nubank.id,month:'2026-11',accountId:'bank',date:'2026-11-05',id:'payment'});
  const today='2026-11-12';
  const report=summaryFor(s,'2026-11',{today});
  assert.deepEqual(report.invoices.map(i=>[i.cardId,i.total,i.status]),[
    ['nubank',12000,'paid'],['inter',8000,'open'],
  ]);
  assert.equal(report.invoiceTotal,20000);
  assert.equal(report.payable,8000);
  assert.equal(report.spending,18000);
  assert.ok(report.rows.every(row=>row.effectiveDate==='2026-11-23'));
  assert.equal(summaryFor(s,'2026-11',{today,cardId:inter.id}).invoiceTotal,8000);
  assert.equal(summaryFor(s,'2026-11',{today:'2026-12-01'}).invoiceTotal,24000);
  assert.equal(summaryFor(s,'2026-12',{today}).invoiceTotal,9000);
});

test('tipo escolhido prevalece sobre sinal positivo e é usado na prévia, duplicatas e gravação',()=>{
  const s=fixture(),parsed=parseCSV('data;descricao;valor\n2026-10-22;Compra teste;123,45');
  assert.equal(parsed[0].type,'income');
  const records=applyCsvType(parsed,'expense');assert.equal(records[0].type,'expense');assert.equal(parsed[0].type,'income');
  assert.equal(previewCsvImport(s,records,'bank').rows[0].type,'expense');
  const before=accountBalance(s,'bank');
  const result=buildCsvImport(s,records,'bank',[0],()=> 'csv-1');s.transactions.push(...result.transactions);
  assert.equal(accountBalance(s,'bank'),before-12345);assert.equal(previewCsvImport(s,records,'bank').duplicateCount,1);
  assert.equal(applyCsvType(records,'income')[0].type,'income');assert.equal(applyCsvType(parsed,'auto')[0].type,'income');
  assert.throws(()=>applyCsvType(parsed,'bad'));
});

test('correção de receitas importadas projeta saldo sem gravar, preservando IDs e demais receitas',()=>{
  const s=fixture();s.transactions.push({id:'wrong',amount:12345,description:'Extrato incorreto',type:'income',source:'csv',accountId:'bank',categoryId:'food',date:'2026-10-22',settledAt:'2026-10-22',status:'completed'});
  const original=structuredClone(s),before=accountBalance(s,'bank');
  const plan=planCsvTypeCorrection(s,['wrong'],'expense');
  assert.deepEqual(s,original);assert.equal(plan.count,1);assert.equal(plan.accounts[0].after,before-24690);
  s.transactions=plan.transactions;
  assert.equal(s.transactions.length,original.transactions.length);assert.equal(s.transactions.find(t=>t.id==='income').type,'income');assert.equal(s.transactions.find(t=>t.id==='wrong').type,'expense');
  validateState(s);
  assert.throws(()=>planCsvTypeCorrection(s,['income'],'expense'),/protegido/);
  assert.throws(()=>planCsvTypeCorrection(s,[],'expense'),/Selecione/);
  assert.throws(()=>planCsvTypeCorrection(s,['wrong'],'expense'),/já estão/);
});

test('correção rejeita em conjunto parcelas pagas e receitas em cartão',()=>{
  const s=fixture();s.transactions.find(t=>t.id==='n-food').source='csv';
  assert.throws(()=>planCsvTypeCorrection(s,['n-food'],'income'),/protegido/);
  registerInvoicePayment(s,{cardId:'nubank',month:'2026-10',accountId:'bank',date:'2026-10-23',id:'payment'});
  assert.throws(()=>planCsvTypeCorrection(s,['n-food'],'expense'),/protegido/);
});

test('seletores ordenam textos em português preservando seleção e opção geral',()=>{
  const option=(value,textContent)=>({value,textContent});
  const select={value:'z',options:[option('z','Saúde'),option('','Todas'),option('a','assinatura'),option('b','Alimentação')],append(item){this.options=this.options.filter(o=>o!==item);this.options.push(item);}};
  sortSelectOptions({querySelectorAll:()=>[select]});
  assert.deepEqual(select.options.map(o=>o.textContent),['Todas','Alimentação','assinatura','Saúde']);assert.equal(select.value,'z');
});
