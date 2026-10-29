import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistantActions} from '../dist/ui-assistant-actions.mjs';
import {createRemoteStorage} from '../dist/remote-storage.mjs';

test('prévia na UI não anuncia sucesso; dois cliques simultâneos confirmam só uma vez e adotam estado persistido',async()=>{
  const listeners={};let requests=[],adopted=0,commits=0,release;
  const ui=createAssistantActions({getState:()=>({accounts:[],categories:[],cards:[]}),getMonth:()=> '2026-10',remote:{flush:async()=>7},onSaved:async()=>{adopted++;},commit:()=>commits++,render:()=>{},e:String,$:selector=>({addEventListener:(type,fn)=>{listeners[selector]=fn;}}),fetcher:async(url,options)=>{
    requests.push(url);if(url.endsWith('/chat'))return Response.json({content:'Revise',pending:{token:'a'.repeat(64),expiresAt:'2026-10-28T12:05:00Z',preview:{amount:3000,description:'Gasolina',type:'expense'}},editableIntent:{intent:'create_transaction'}});
    await new Promise(r=>{release=r;});return Response.json({content:'Salvo',transactionId:'t1',state:{},revision:8});
  }});
  await ui.send('Gastei 30 de gasolina');assert.equal(commits,0);assert.match(ui.render(),/Confirmar/);assert.ok(!ui.render().includes('Salvo'));
  ui.bind();const first=listeners['#assistant-confirm']();await Promise.resolve();await listeners['#assistant-confirm']();release();await first;
  assert.equal(requests.length,2);assert.equal(adopted,1);assert.equal(commits,1);assert.match(ui.render(),/Ver lançamento/);assert.ok(!ui.render().includes('id="assistant-confirm"'));
});
test('aceitar estado do servidor atualiza a revisão da próxima gravação',async()=>{
  let body;const remote=createRemoteStorage({fetcher:async(url,options)=>{body=options.body&&JSON.parse(options.body);return Response.json(options.method==='GET'?{revision:1,state:{}}:{revision:9});}});
  await remote.load();remote.acceptSnapshot({revision:8});await remote.save({});assert.equal(body.revision,8);
});
