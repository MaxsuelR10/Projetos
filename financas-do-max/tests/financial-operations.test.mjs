import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState, validateState, accountBalance} from '../dist/domain.mjs';
import {settleTransaction, cancelTransaction, restoreTransaction, markSubscription} from '../dist/financial-operations.mjs';

const fixture = () => {const s=seedState('2026-10-22');s.transactions=[{id:'t',description:'Serviço recorrente',amount:2190,type:'expense',date:'2026-10-10',dueDate:'2026-10-10',status:'pending',categoryId:'digital',accountId:'bank',cardId:''}];return s;};
test('liquidação escolhe data efetiva e altera o saldo somente uma vez',()=>{
  const s=fixture(),before=accountBalance(s,'bank');settleTransaction(s,'t','2026-10-22');
  validateState(s);assert.equal(accountBalance(s,'bank'),before-2190);assert.equal(s.transactions[0].settledAt,'2026-10-22');
  assert.throws(()=>settleTransaction(s,'t','2026-10-22'));assert.equal(accountBalance(s,'bank'),before-2190);
});
test('cancelar preserva o registro e restaurar volta como pendente',()=>{
  const s=fixture(),before=accountBalance(s,'bank');settleTransaction(s,'t','2026-10-22');cancelTransaction(s,'t');
  assert.equal(s.transactions.length,1);assert.equal(accountBalance(s,'bank'),before);
  restoreTransaction(s,'t');assert.equal(s.transactions[0].status,'pending');assert.equal(accountBalance(s,'bank'),before);
  assert.throws(()=>restoreTransaction(s,'t'));validateState(s);
});
test('cancelamento de transferência desfaz os dois lados atomicamente no controle',()=>{
  const s=fixture();s.transactions[0]={...s.transactions[0],type:'transfer',toAccountId:'wallet',status:'completed',settledAt:'2026-10-10'};
  const bank=accountBalance(s,'bank'),wallet=accountBalance(s,'wallet');cancelTransaction(s,'t');
  assert.equal(accountBalance(s,'bank'),bank+2190);assert.equal(accountBalance(s,'wallet'),wallet-2190);validateState(s);
});
test('pagamentos de fatura protegidos e datas inválidas não são alterados',()=>{
  const s=fixture(),original=structuredClone(s);assert.throws(()=>settleTransaction(s,'t','2026-02-30'));assert.deepEqual(s,original);
  s.transactions[0].invoicePaymentId='invoice';const protectedCopy=structuredClone(s);
  for(const action of [()=>settleTransaction(s,'t','2026-10-22'),()=>cancelTransaction(s,'t'),()=>restoreTransaction(s,'t')])assert.throws(action);
  assert.deepEqual(s,protectedCopy);
});
test('marcar como assinatura não cria transação nem muda saldo',()=>{
  const s=fixture();settleTransaction(s,'t','2026-10-22');const before=accountBalance(s,'bank');
  const x=markSubscription(s,{transactionId:'t',id:'new-sub',name:'Serviço recorrente',cycle:'month',nextDate:'2026-11-10'});
  assert.equal(x.amount,2190);assert.equal(s.transactions.length,1);assert.equal(accountBalance(s,'bank'),before);
  assert.equal(s.transactions[0].subscriptionId,'new-sub');assert.throws(()=>markSubscription(s,{transactionId:'t',id:'other'}));validateState(s);
});
test('vincular assinatura existente não duplica serviços; compra parcelada é rejeitada',()=>{
  const s=fixture(),count=s.subscriptions.length;markSubscription(s,{transactionId:'t',subscriptionId:s.subscriptions[0].id});assert.equal(s.subscriptions.length,count);
  const other=fixture();other.transactions[0].installmentCount=2;assert.throws(()=>markSubscription(other,{transactionId:'t',id:'new-sub',name:'Exemplo',cycle:'month',nextDate:'2026-11-10'}));
});
