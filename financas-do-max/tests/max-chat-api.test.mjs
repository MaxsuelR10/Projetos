import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApi} from '../http-api.mjs';
import {seedState} from '../dist/domain.mjs';

test('chat exige sessão e origem, lê conta autenticada, rejeita revisão antiga e entrada inválida',async t=>{
  let workspace,called=0;const state=seedState();state.messages=[];
  const api=createApi({APP_ORIGIN:'http://app.test'},{auth:{user:async req=>req.headers.cookie?{id:'alice'}:null},storeFactory:(url,id)=>{workspace=id;return {read:async()=>({revision:7,state})};},maxAI:{status:()=>({configured:true,provider:'Gemini'}),reply:async input=>{called++;assert.equal(input.state,state);assert.equal(input.userId,'alice');return {source:'gemini',content:'Resposta'};}}});
  const server=createServer(api);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`;
  const send=(body,headers={})=>fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://app.test',Cookie:'test',...headers},body:JSON.stringify(body)});
  const input={message:'Resumo',month:'2026-10',revision:7,state:{FAKE:true},userId:'bob'};
  assert.equal((await fetch(base+'/api/chat/status')).status,401);
  assert.equal((await send(input,{Cookie:''})).status,401);
  assert.equal((await send(input,{Origin:'https://foreign.test'})).status,403);
  assert.equal((await send({...input,revision:6})).status,409);assert.equal(called,0);
  for(const bad of [null,{...input,message:''},{...input,message:'x'.repeat(2001)},{...input,month:'2026-13'},{...input,revision:'7'}])assert.equal((await send(bad)).status,400);
  const res=await send(input);assert.equal(res.status,200);assert.equal((await res.json()).source,'gemini');assert.equal(workspace,'user:alice');assert.equal(called,1);
});
