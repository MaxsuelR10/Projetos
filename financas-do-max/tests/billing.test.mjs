import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseInvoiceMonth,invoiceDates,installmentAmount,invoiceFor,cardCommitment,registerInvoicePayment,assertPurchaseAllowed,assertPurchaseEditable,creditInstallmentPlans} from '../dist/billing.mjs';
import {seedState,validateState,accountBalance,monthlyRows,totals,financialReport,categoryTotals,pendingExpenses,installmentSummary,parseCSV,csvExport} from '../dist/domain.mjs';
function fixture(){const s=seedState('2026-10-21');s.transactions=[];s.invoicePayments=[];s.installments=[];s.cards[0].closingDay=3;s.cards[0].dueDay=23;return s;}
function purchase(s,overrides={}){const t={id:'purchase-1',description:'Compra em três vezes',amount:10001,type:'expense',date:'2026-10-02',cardId:'card',accountId:'bank',categoryId:'shopping',installmentCount:3,status:'completed',hidden:false,...overrides};s.transactions.push(t);return t;}
function pay(s,month='2026-10',id='payment-1'){return registerInvoicePayment(s,{cardId:'card',month,accountId:'bank',date:'2026-10-23',id});}

test('fechamento exclusivo: antes vai para a fatura atual; no dia e depois vão para a seguinte',()=>{
  const card={closingDay:3,dueDay:23};
  assert.equal(purchaseInvoiceMonth(card,'2026-10-02'),'2026-10');
  assert.equal(purchaseInvoiceMonth(card,'2026-10-03'),'2026-11');
  assert.equal(purchaseInvoiceMonth(card,'2026-10-04'),'2026-11');
});
test('vencimento no mesmo dia ou antes do fechamento desloca a referência',()=>{
  assert.equal(purchaseInvoiceMonth({closingDay:3,dueDay:1},'2026-10-02'),'2026-11');
  assert.equal(purchaseInvoiceMonth({closingDay:3,dueDay:1},'2026-10-03'),'2026-12');
  assert.equal(purchaseInvoiceMonth({closingDay:3,dueDay:3},'2026-10-02'),'2026-11');
  assert.deepEqual(invoiceDates({closingDay:3,dueDay:1},'2026-11'),{closingDate:'2026-10-03',dueDate:'2026-11-01'});
});
test('fechamento em meses curtos respeita fevereiro normal e bissexto',()=>{
  const card={closingDay:31,dueDay:5};
  assert.equal(purchaseInvoiceMonth(card,'2026-02-27'),'2026-03');
  assert.equal(purchaseInvoiceMonth(card,'2026-02-28'),'2026-04');
  assert.equal(purchaseInvoiceMonth(card,'2024-02-28'),'2024-03');
  assert.equal(purchaseInvoiceMonth(card,'2024-02-29'),'2024-04');
  assert.equal(invoiceDates(card,'2024-03').closingDate,'2024-02-29');
});
test('parcelas atravessam o ano sem perder a referência de vencimento',()=>{
  const card={closingDay:20,dueDay:27};
  assert.equal(purchaseInvoiceMonth(card,'2026-12-10',0),'2026-12');
  assert.equal(purchaseInvoiceMonth(card,'2026-12-10',1),'2027-01');
  assert.equal(purchaseInvoiceMonth(card,'2026-12-20',0),'2027-01');
});
test('a soma das parcelas em centavos é igual ao total da compra',()=>{
  assert.deepEqual([0,1,2].map(i=>installmentAmount(10001,3,i)),[3334,3334,3333]);
  for(const total of [1,2,5,99,100,101,10001])for(const count of [1,2,3,12].filter(n=>n<=total))assert.equal(Array.from({length:count},(_,i)=>installmentAmount(total,count,i)).reduce((a,b)=>a+b,0),total);
  for(const args of [[1,2,0],[100,0,0],[100,3,3],[0,1,0],[1.5,1,0]])assert.throws(()=>installmentAmount(...args));
});
test('fatura contém a parcela do mês e o limite considera toda a compra',()=>{
  const s=fixture();purchase(s);
  assert.equal(invoiceFor(s,s.cards[0],'2026-10').total,3334);
  assert.equal(invoiceFor(s,s.cards[0],'2026-11').total,3334);
  assert.equal(invoiceFor(s,s.cards[0],'2026-12').total,3333);
  assert.equal(invoiceFor(s,s.cards[0],'2027-01').total,0);
  assert.equal(cardCommitment(s,s.cards[0]).used,10001);
});
test('pagamento baixa saldo uma vez e libera apenas a parcela paga',()=>{
  const s=fixture();purchase(s);const before=accountBalance(s,'bank');
  pay(s);assert.equal(validateState(s),s);
  assert.equal(accountBalance(s,'bank'),before-3334);
  assert.equal(cardCommitment(s,s.cards[0]).used,6667);
  assert.equal(invoiceFor(s,s.cards[0],'2026-10').status,'paid');
  const length=s.transactions.length;assert.throws(()=>pay(s,'2026-10','payment-2'),/já foi paga/);
  assert.equal(s.transactions.length,length);assert.equal(accountBalance(s,'bank'),before-3334);
});
test('caixa usa liquidação e orçamento consome a compra sem duplicar a fatura',()=>{
  const s=fixture();purchase(s);pay(s);
  assert.equal(totals(monthlyRows(s,'2026-10')).expense,10001);
  assert.equal(financialReport(s,'2026-10',{basis:'cash'}).summary.expense,3334);
  assert.equal(categoryTotals(s,'2026-10').find(c=>c.id==='shopping').total,10001);
  assert.equal(categoryTotals(s,'2026-10').find(c=>c.id==='other').total,0);
  assert.equal(pendingExpenses(s,'2026-10'),0);assert.equal(pendingExpenses(s,'2026-11'),3334);
});
test('pendência não reduz saldo; liquidação em outro mês afeta somente o caixa correto',()=>{
  const s=fixture();const t={id:'cash-1',description:'Conta pendente',amount:2000,type:'expense',accountId:'bank',categoryId:'home',date:'2026-10-15',status:'pending'};
  s.transactions.push(t);const opening=accountBalance(s,'bank');
  assert.equal(opening,s.accounts[0].openingBalance);assert.equal(pendingExpenses(s,'2026-10'),2000);
  assert.equal(financialReport(s,'2026-10').summary.expense,0);
  t.status='completed';t.settledAt='2026-11-02';assert.equal(accountBalance(s,'bank'),opening-2000);
  assert.equal(financialReport(s,'2026-10').summary.expense,0);assert.equal(financialReport(s,'2026-11').summary.expense,2000);
  assert.equal(financialReport(s,'2026-11').rows[0].effectiveDate,'2026-11-02');
});
test('cancelados permanecem recuperáveis no histórico sem efeito financeiro',()=>{
  const s=fixture();const t=purchase(s,{cardId:'',installmentCount:undefined,status:'cancelled'});
  assert.equal(monthlyRows(s,'2026-10').length,0);assert.equal(monthlyRows(s,'2026-10',{includeCancelled:true}).length,1);
  assert.equal(totals([t]).expense,0);assert.equal(accountBalance(s,'bank'),s.accounts[0].openingBalance);
});
test('cartão legado mantém dados e exige configuração antes de pagamento',()=>{
  const s=fixture();delete s.cards[0].closingDay;delete s.invoicePayments;purchase(s);
  assert.equal(validateState(s),s);const invoice=invoiceFor(s,s.cards[0],'2026-10');
  assert.equal(invoice.configured,false);assert.equal(invoice.total,3334);assert.throws(()=>pay(s),/Configure o fechamento/);
});
test('backup inconsistente não pode criar pagamento ou adulterar uma parcela paga',()=>{
  const s=fixture();purchase(s);pay(s);
  for(const mutate of [x=>x.invoicePayments.push({...x.invoicePayments[0],id:'clone'}),x=>x.invoicePayments[0].items[0].amount++,x=>x.transactions[0].amount++,x=>x.transactions[1].amount++,x=>x.transactions[1].status='pending',x=>x.transactions.pop(),x=>x.invoicePayments=[]]){const copy=structuredClone(s);mutate(copy);assert.throws(()=>validateState(copy));}
  assert.equal(validateState(JSON.parse(JSON.stringify(s))).invoicePayments.length,1);
});
test('compra já paga e inclusão retroativa em fatura paga são protegidas',()=>{
  const s=fixture(),t=purchase(s);pay(s);
  assert.throws(()=>assertPurchaseEditable(s,t.id),/já paga/);
  assert.throws(()=>assertPurchaseAllowed(s,{...t,id:'another'}),/já paga/);
});
test('faturas vazias e datas inválidas não geram lançamentos',()=>{
  const s=fixture();assert.throws(()=>pay(s),/vazia/);assert.equal(s.transactions.length,0);
  purchase(s);assert.throws(()=>registerInvoicePayment(s,{cardId:'card',month:'2026-10',accountId:'bank',date:'2026-02-30',id:'invalid'}));assert.equal(s.invoicePayments.length,0);
});
test('ocultar uma compra não apaga o compromisso nem altera uma fatura paga',()=>{
  const s=fixture(),t=purchase(s);t.hidden=true;assert.equal(cardCommitment(s,s.cards[0]).used,10001);
  assert.equal(invoiceFor(s,s.cards[0],'2026-10').total,3334);pay(s);assert.equal(validateState(s),s);
  assert.equal(financialReport(s,'2026-10',{cardId:'card'}).summary.expense,3334);
});
test('plano de parcelas vinculado acompanha pagamentos e preserva o centavo final',()=>{
  const s=fixture();purchase(s);pay(s);pay(s,'2026-11','payment-2');
  const plans=creditInstallmentPlans(s);assert.equal(plans[0].paid,2);assert.equal(plans[0].amount,3333);assert.equal(plans[0].nextMonth,'2026-12');
  assert.deepEqual(installmentSummary(plans),{total:10001,paid:6668,remaining:3333,monthly:3333,count:1});
});
test('CSV de pagamento não pode ser reimportado como despesa comum',()=>{
  const s=fixture();purchase(s);pay(s);const csv=csvExport([s.transactions[1]],s);
  assert.ok(csv.includes('pagamento_fatura'));assert.throws(()=>parseCSV(csv),/fatura/);
});
