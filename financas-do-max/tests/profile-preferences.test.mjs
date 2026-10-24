import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState,validateState,currency,moneyInput} from '../dist/domain.mjs';
import {appendAudit} from '../dist/audit.mjs';
import {applyInputMasks} from '../dist/input-masks.mjs';
import {createRecurrenceUI} from '../dist/ui-recurrences.mjs';

test('salário e paleta sobrevivem ao backup, com validação e histórico',()=>{
  const before=seedState(),after=structuredClone(before);
  Object.assign(after.profile,{salary:350050,palette:'rose'});
  appendAudit(before,after,{action:'Perfil salvo.'});
  const restored=validateState(JSON.parse(JSON.stringify(after)));
  assert.equal(restored.profile.salary,350050);
  assert.equal(restored.profile.palette,'rose');
  assert.equal(restored.auditLog.at(-1).changes[0].after.salary,350050);
  assert.doesNotThrow(()=>validateState(before));
  assert.throws(()=>validateState({...after,profile:{...after.profile,salary:-1}}));
  assert.throws(()=>validateState({...after,profile:{...after.profile,palette:'invalid'}}));
});

test('abrir formulário preserva valores inteiros e decimais em reais',()=>{
  for(const [value,cents] of [['3500',350000],['3500,50',350050],['9,5',950],['0',0],['-12,50',-1250]]){
    const input={value,addEventListener(){}};
    applyInputMasks({querySelectorAll:selector=>selector==='input[data-mask="currency"]'?[input]:[]});
    assert.equal(moneyInput(input.value),cents);
  }
});

test('usar salário preenche a recorrência sem criar lançamentos ou salvar antecipadamente',()=>{
  const state=seedState();state.profile.salary=350050;
  let commits=0,html='',click;
  const controls=Object.fromEntries(['name','type','amount','frequency','interval','cardId','accountId'].map(name=>[name,{value:'',addEventListener(){},dispatchEvent(){}}]));
  const form={querySelector:selector=>selector==='#use-profile-salary'?{addEventListener:(event,handler)=>{click=handler;}}:controls[selector.match(/name="([^"]+)"/)?.[1]]};
  const ctx={getState:()=>state,getAccount:()=>'',e:String,currency,localDate:()=> '2026-10-24',field:()=>'',selectField:()=>'',options:()=>'',selected:()=>'',formFooter:()=>'',openModal:(title,body)=>{html=body;},$:()=>form,commit:()=>{commits++;}};
  createRecurrenceUI(ctx).recurrenceModal();
  assert.match(html,/Usar salário do perfil/);
  click();
  assert.equal(controls.name.value,'Salário');
  assert.equal(controls.type.value,'income');
  assert.equal(moneyInput(controls.amount.value),350050);
  assert.equal(controls.frequency.value,'month');
  assert.equal(commits,0);
});
