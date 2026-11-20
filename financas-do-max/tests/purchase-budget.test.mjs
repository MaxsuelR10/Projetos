import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePurchase,purchaseBudgetReply,isPurchaseQuestion} from '../dist/purchase-budget.mjs';
import {createMaxAI} from '../max-ai.mjs';

function fixture(){const state={categories:[{id:'shopping',name:'Compras',budget:50000}],cards:[{id:'c',name:'Cartão',limit:100000,closingDay:10,dueDay:20}],transactions:[{id:'old',type:'expense',amount:40000,categoryId:'shopping',cardId:'c',date:'2026-10-15',installmentCount:2},{id:'cash',type:'expense',amount:10000,categoryId:'shopping',date:'2026-11-01',status:'pending'},{id:'payment',type:'expense',amount:99900,categoryId:'shopping',date:'2026-11-01',invoicePaymentId:'p'},{id:'cancelled',type:'expense',amount:99900,categoryId:'shopping',date:'2026-11-01',status:'cancelled'}],invoicePayments:[]};state.transactions.forEach(t=>t.description=t.id);return state;}
const input={amount:15000,installments:1,date:'2026-11-01',categoryId:'shopping',cardId:'c',payment:'card'};

test('compara o valor novo com saldo da categoria e fatura, sem duplicar pagamento ou salvar compra',()=>{
  const s=fixture(),before=structuredClone(s),r=evaluatePurchase(s,input);
  assert.equal(r.months[0].used,30000);assert.equal(r.months[0].remaining,20000);assert.equal(r.months[0].after,5000);
  assert.equal(r.months[0].invoiceBefore,20000);assert.equal(r.months[0].invoiceAfter,35000);assert.equal(r.categoryFits,true);
  assert.equal(evaluatePurchase(s,{...input,amount:25000}).categoryFits,false);
  assert.deepEqual(s,before);
});
test('compra no fechamento entra no próximo mês e testa cada parcela, inclusive um mês futuro sem folga',()=>{
  const s=fixture();s.transactions.push({id:'future',type:'expense',amount:49000,date:'2026-12-01',description:'Futura',categoryId:'shopping'});
  const r=evaluatePurchase(s,{...input,date:'2026-11-10',amount:10001,installments:2});
  assert.deepEqual(r.months.map(m=>m.month),['2026-12','2027-01']);
  assert.deepEqual(r.months.map(m=>m.amount),[5001,5000]);assert.equal(r.months[0].after,-24001);assert.equal(r.categoryFits,false);
});
test('limite do cartão considera valor total, mesmo parcelado, independente do orçamento',()=>{
  const s=fixture();s.categories[0].budget=1000000;
  const r=evaluatePurchase(s,{...input,amount:70000,installments:10});
  assert.equal(r.cardAvailable,60000);assert.equal(r.cardFits,false);assert.equal(r.categoryFits,true);
  assert.match(purchaseBudgetReply(s,{...input,amount:70000,installments:10}),/Não comporta o valor total/);
});
test('orçamento ausente é inconclusivo; dinheiro usa mês da compra e não exige cartão',()=>{
  const s=fixture();s.categories[0].budget=0;
  const r=evaluatePurchase(s,{...input,payment:'cash',cardId:'',date:'2026-11-20'});
  assert.equal(r.categoryFits,null);assert.equal(r.cardFits,null);assert.equal(r.months[0].month,'2026-11');
  assert.match(purchaseBudgetReply(s,{...input,payment:'cash'}),/não tem um limite/);
});
test('rejeita dados incompletos, cartão sem ciclo, identificadores externos e valores inválidos',()=>{
  for(const patch of [{amount:0},{amount:NaN},{amount:12.1},{categoryId:'other-user'},{cardId:'other-user'},{payment:''},{installments:121},{date:'2026-02-30'},{payment:'cash',installments:2}])assert.throws(()=>evaluatePurchase(fixture(),{...input,...patch}));
  const s=fixture();delete s.cards[0].closingDay;assert.throws(()=>evaluatePurchase(s,input),/Configure o fechamento/);
});
test('alerta sobre fatura já paga',()=>{
  const s=fixture();s.invoicePayments=[{cardId:'c',month:'2026-11',date:'2026-11-01',amount:20000}];
  assert.equal(evaluatePurchase(s,input).paidInvoice,true);assert.match(purchaseBudgetReply(s,input),/fatura já paga/);
});
test('local e modo Gemini usam o mesmo cálculo guiado sem depender da geração de texto',async()=>{
  const s=fixture(),expected=purchaseBudgetReply(s,input);
  for(const env of [{},{GEMINI_API_KEY:'fake'}]){
    const reply=await createMaxAI(env,{generate:()=>assert.fail('Consulta guiada não depende do modelo')}).reply({state:s,purchase:input,month:'2026-11',message:'Cabe?',userId:'u'});
    assert.equal(reply.content,expected);assert.equal(reply.source,'local');
  }
  for(const q of ['Quero comprar um tênis','Isso cabe no meu orçamento?','Consigo comprar?','Dá pra comprar isso?'])assert.equal(isPurchaseQuestion(q),true);
});
