import test from 'node:test';
import assert from 'node:assert/strict';
import {summaryFor,sortSelectOptions,uncategorizedOption} from '../dist/summary.mjs';
import {seedState,parseCSV,validateState,accountBalance,categoryTotals,financialReport} from '../dist/domain.mjs';
import {invoiceFor,registerInvoicePayment,editInvoicePayment,cancelInvoicePayment,creditInstallmentPlans,assertPurchaseAllowed} from '../dist/billing.mjs';
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

test('faturas do mês atual somam dois cartões pelo vencimento e batem com a tela de Cartões',()=>{
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
    ['inter',12000,'open'],
  ]);
  assert.equal(report.invoiceTotal,12000);
  assert.equal(report.payable,12000);
  assert.equal(report.spending,22000);
  assert.ok(report.rows.every(row=>row.effectiveDate==='2026-11-23'));
  assert.equal(summaryFor(s,'2026-11',{today,cardId:inter.id}).invoiceTotal,invoiceFor(s,inter,'2026-11').total);
  assert.equal(summaryFor(s,'2026-11',{today:'2026-12-01'}).invoiceTotal,12000);
  assert.equal(summaryFor(s,'2026-12',{today}).invoiceTotal,9000);
});

test('faturas futuras aparecem na própria competência e gastos sem categoria aparecem no resumo',()=>{
  const s=fixture();
  s.transactions.find(t=>t.id==='i-market').categoryId='';
  const october=summaryFor(s,'2026-10');
  assert.deepEqual(october.categories.find(c=>c.id===uncategorizedOption(s).id),{
    id:uncategorizedOption(s).id,name:'Sem categoria',icon:'◌',total:7000,
  });
  assert.equal(october.categories.reduce((sum,c)=>sum+c.total,0),october.spending);

  s.transactions.find(t=>t.id==='n-food').date='2026-10-04';
  s.transactions.find(t=>t.id==='n-market').date='2026-10-04';
  const report=summaryFor(s,'2026-10');
  assert.equal(report.invoiceTotal,7000);
  assert.deepEqual(report.invoices.map(i=>i.cardId),['inter']);
  assert.equal(summaryFor(s,'2026-11').invoices.find(i=>i.cardId==='nubank').remainingAmount,8000);
});

test('novembro mostra Nubank e Inter pelo saldo e mantém categorias, caixa e histórico reconciliados',()=>{
  const s=fixture(),[nubank,inter]=s.cards;
  Object.assign(nubank,{closingDay:16,dueDay:20});
  Object.assign(inter,{closingDay:6,dueDay:12});
  const purchase=(card,id,date,amount,categoryId='transport',installmentCount=1)=>({
    id,description:id,cardId:card.id,accountId:card.accountId,date,amount,categoryId,installmentCount,type:'expense',status:'completed',
  });
  s.transactions=[
    purchase(nubank,'Nubank combustível','2026-10-22',15000),
    purchase(inter,'Inter combustível','2026-10-22',10000),
    purchase(nubank,'Nubank alimentação','2026-10-26',20000,'food'),
    purchase(inter,'Inter alimentação','2026-10-26',8000,'food'),
    purchase(nubank,'Compra em três vezes','2026-10-22',60000,'shopping',3),
    purchase(inter,'Compra anterior','2026-10-05',5000,'food'),
  ];
  s.categories.find(c=>c.id==='transport').name='Combustível';
  const month='2026-11',today='2026-11-15';
  const get=(state=s)=>summaryFor(state,month,{today});
  const pending=(state=s)=>get(state).invoices.map(i=>[i.cardId,i.remainingAmount,i.status,i.dueDate]);
  const pay=(state,card,amount,id)=>registerInvoicePayment(state,{cardId:card.id,month,accountId:card.accountId,date:'2026-11-15',amount,id});
  assert.deepEqual(pending(),[
    ['nubank',55000,'open','2026-11-20'],['inter',18000,'overdue','2026-11-12'],
  ]);
  assert.equal(get().invoiceTotal,73000);
  assert.deepEqual(get().overdueInvoices.map(i=>[i.cardId,i.month,i.remainingAmount]),[['inter','2026-10',5000]]);
  assert.equal(summaryFor(s,'2026-12',{today:'2026-12-01'}).overdueInvoiceTotal,78000);
  assert.deepEqual(['2026-11','2026-12','2027-01'].map(reference=>invoiceFor(s,nubank,reference).items.find(i=>i.transactionId==='Compra em três vezes').amount),[20000,20000,20000]);
  assert.equal(get().categories.find(c=>c.name==='Combustível').total,25000);
  assert.equal(get().categories.find(c=>c.id==='food').total,28000);
  const opposite=structuredClone(s);
  pay(opposite,inter,undefined,'inter-first');
  assert.deepEqual(pending(opposite).map(([id])=>id),['nubank']);

  const before=accountBalance(s,'bank');
  pay(s,nubank,12000,'partial');
  assert.equal(get().invoiceTotal,61000);
  assert.equal(accountBalance(s,'bank'),before-12000);
  assert.throws(()=>pay(s,nubank,12000,'partial'),/já utilizado/);
  assert.throws(()=>pay(s,nubank,43001,'too-much'),/saldo da fatura/);
  assert.equal(accountBalance(s,'bank'),before-12000);
  editInvoicePayment(s,'partial',{accountId:'bank',date:'2026-11-15',amount:4000});
  assert.equal(get().invoiceTotal,69000);
  assert.equal(accountBalance(s,'bank'),before-4000);
  assert.ok(creditInstallmentPlans(s)[0].paidAmount<=4000);

  pay(s,nubank,undefined,'rest');
  assert.deepEqual(pending().map(([id])=>id),['inter']);
  assert.equal(accountBalance(s,'bank'),before-55000);
  const paid=invoiceFor(s,nubank,month,today);
  assert.equal(paid.status,'paid');
  assert.equal(paid.total,55000);
  assert.equal(paid.remainingAmount,0);
  assert.equal(paid.paidAmount,55000);
  assert.equal(paid.payments.length,2);
  assert.equal(paid.items.length,3);
  assert.equal(financialReport(s,month).summary.expense,55000);
  assert.equal(categoryTotals(s,month).find(c=>c.name==='Combustível').total,25000);
  assert.throws(()=>pay(s,nubank,undefined,'again'),/já foi paga/);

  pay(s,inter,undefined,'inter-last');
  assert.deepEqual(pending(),[]);
  assert.equal(get().invoiceTotal,0);
  assert.equal(get().spending,73000);
  assert.equal(get().overdueInvoiceTotal,5000);
  cancelInvoicePayment(s,'rest',today);
  assert.throws(()=>cancelInvoicePayment(s,'rest',today),/ativo/);
  const reopened=invoiceFor(s,nubank,month,today);
  assert.equal(reopened.remainingAmount,51000);
  assert.equal(reopened.payments.find(p=>p.id==='rest').cancelledAt,today);
  assert.equal(accountBalance(s,'bank'),before-4000);
  assert.equal(get().categories.find(c=>c.name==='Combustível').total,25000);
  validateState(JSON.parse(JSON.stringify(s)));
  const newPurchase=purchase(nubank,'Compra durante pagamento parcial','2026-11-14',500);
  assertPurchaseAllowed(s,newPurchase);
  s.transactions.push(newPurchase);
  assert.equal(get().invoiceTotal,51500);
  assert.equal(get().categories.find(c=>c.name==='Combustível').total,25500);
  validateState(s);
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
