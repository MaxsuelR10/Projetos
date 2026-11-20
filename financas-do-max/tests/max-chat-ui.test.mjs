import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaxChat} from '../dist/ui-max-chat.mjs';
import {seedState} from '../dist/domain.mjs';

function fixture(fetcher){
  let state=seedState(),revision=7,month='2026-10';state.messages=[];const listeners={};
  const chat=createMaxChat({getState:()=>state,getMonth:()=>month,setMonth:value=>{month=value;},commit:fn=>{const next=structuredClone(state);fn(next);state=next;revision++;},remote:{flush:async()=>revision},render:()=>{},e:s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),icon:()=>'', $:selector=>selector==='#max-mode'?{addEventListener:(type,fn)=>{listeners.mode=fn;}}:null,fetcher});
  return {chat,state:()=>state,gemini:()=>{chat.bind();listeners.mode({target:{value:'gemini'}});}};
}
test('UI envia apenas pergunta, mês e revisão após salvar e rotula origem',async()=>{
  let sent;const f=fixture(async(url,options)=>{if(url.endsWith('/status'))return Response.json({configured:true});sent=JSON.parse(options.body);return Response.json({content:'<script>Texto seguro</script>',source:'gemini',month:'2026-10'});});
  await f.chat.init();f.gemini();await f.chat.send('Me ajude');
  assert.deepEqual(sent,{message:'Me ajude',month:'2026-10',revision:8});assert.equal(f.state().messages.at(-1).source,'gemini');
  assert.ok(f.chat.render().includes('&lt;script>'));assert.ok(f.chat.render().includes('Max · Gemini'));
});
test('UI preserva pergunta para tentar novamente e não inventa resposta em erro HTTP',async()=>{
  const f=fixture(async url=>url.endsWith('/status')?Response.json({configured:true}):Response.json({error:'Os dados mudaram.'},{status:409}));
  await f.chat.init();f.gemini();await f.chat.send('Quanto gastei?');assert.equal(f.state().messages.length,1);assert.match(f.chat.render(),/Os dados mudaram/);
  await f.chat.send('Quanto gastei?');assert.equal(f.state().messages.length,1);
});
test('UI identifica fallback local e mantém modo local sem chamar endpoint do Gemini',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;return Response.json({configured:false});});
  await f.chat.init();await f.chat.send('Quanto gastei este mês?');assert.equal(calls,1);assert.equal(f.state().messages.at(-1).source,'local');
  assert.match(f.chat.render(),/Gemini · indisponível/);
});


test('pergunta de compra abre consulta guiada em vez de retornar categorias aleatórias',async()=>{
  const f=fixture(()=>assert.fail('Não deve consultar o provedor'));
  await f.chat.send('Quero comprar um tênis. Cabe no meu orçamento?');
  assert.equal(f.state().messages.length,0);
  assert.match(f.chat.render(),/id="purchase-form"/);
  assert.match(f.chat.render(),/Escolha a categoria/);
});

test('consulta guiada local e Gemini transporta dados estruturados e fecha formulário após resposta',async()=>{
  for(const gemini of [false,true]){
    let sent;
    const f=fixture(async(url,options)=>{if(url.endsWith('/status'))return Response.json({configured:true});sent=JSON.parse(options.body);return Response.json({content:'Cabe no orçamento da categoria.',source:'local'});});
    await f.chat.init();if(gemini)f.gemini();
    const purchase={amount:15000,categoryId:f.state().categories[0].id,date:'2026-11-20',installments:1,payment:'cash',cardId:''};
    await f.chat.send('Quero comprar algo');
    await f.chat.send('Essa compra cabe no orçamento?',purchase);
    assert.equal(f.state().messages.at(-1).source,'local');
    assert.match(f.state().messages.at(-1).content,/orçamento da categoria/);
    assert.ok(!f.chat.render().includes('id="purchase-form"'));
    if(gemini){assert.deepEqual(sent.purchase,purchase);assert.equal(sent.month,'2026-11');}
    else assert.equal(sent,undefined);
  }
});
