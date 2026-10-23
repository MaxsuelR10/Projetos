import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../dist/domain.mjs';
import {subscriptionCalendar} from '../dist/subscription-calendar.mjs';

const fixture=()=>{const s=seedState('2026-10-22');s.transactions=[];s.subscriptions=[{id:'sub',name:'Assinatura teste',amount:3000,accountId:'bank',nextDate:'2026-01-31',cycle:'month',active:true}];return s;};
test('calendário projeta dia-base e fevereiro sem alterar estado',()=>{
  const s=fixture(),copy=structuredClone(s);assert.equal(subscriptionCalendar(s,'2026-02')[0].date,'2026-02-28');assert.equal(subscriptionCalendar(s,'2026-03')[0].date,'2026-03-31');assert.deepEqual(s,copy);
});
test('assinatura anual aparece somente no mês e ano aplicáveis, sem projeção passada',()=>{
  const s=fixture();s.subscriptions[0].cycle='year';assert.equal(subscriptionCalendar(s,'2026-02').length,0);assert.equal(subscriptionCalendar(s,'2025-01').length,0);assert.equal(subscriptionCalendar(s,'2027-01').length,1);
});
test('regra vinculada preserva histórico e projeta somente ocorrências ainda não geradas',()=>{
  const s=fixture();s.subscriptions[0].nextDate='2026-02-28';s.recurrences=[{id:'rule',subscriptionId:'sub',startDate:'2026-01-31',nextOccurrenceDate:'2026-02-28',frequency:'month',interval:1,occurrencesGenerated:1,status:'active',amount:3000}];
  s.transactions=[{id:'tx',recurringTransactionId:'rule',recurrenceDate:'2026-01-31',date:'2026-01-31',status:'pending',amount:3000}];
  assert.equal(subscriptionCalendar(s,'2026-01')[0].projection,false);assert.equal(subscriptionCalendar(s,'2026-03')[0].date,'2026-03-31');
  s.recurrences[0].status='paused';assert.equal(subscriptionCalendar(s,'2026-03').length,0);assert.equal(subscriptionCalendar(s,'2026-01').length,1);
});
test('assinatura identificada não duplica evento se há lançamento no mesmo dia',()=>{
  const s=fixture();s.transactions=[{id:'tx',subscriptionId:'sub',date:'2026-01-31',status:'completed',amount:3000}];const events=subscriptionCalendar(s,'2026-01');assert.equal(events.length,1);assert.equal(events[0].transactionId,'tx');
});
