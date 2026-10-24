import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaxAI} from '../max-ai.mjs';
import {maxFinancialContext} from '../dist/max-financial-context.mjs';
import {seedState} from '../dist/domain.mjs';

function fixture(){const state=seedState();state.transactions=[];state.installments=[];state.cards=[];state.subscriptions=[];state.messages=[];state.profile.name='PRIVATE PROFILE';state.accounts=[{id:'a',name:'PRIVATE ACCOUNT',openingBalance:10000,color:'#000000'}];state.categories=[{id:'c',name:'Mercado',budget:50000,keywords:[],icon:'x'}];state.transactions=[{id:'i',date:'2026-10-01',description:'PRIVATE INCOME',type:'income',amount:300000,accountId:'a',status:'completed'},{id:'e',date:'2026-10-02',description:'PRIVATE MERCHANT',type:'expense',amount:15000,accountId:'a',categoryId:'c',status:'completed'},{id:'p',date:'2026-10-03',description:'PRIVATE PENDING',type:'expense',amount:5000,accountId:'a',categoryId:'c',status:'pending'}];return state;}
const args=()=>({state:fixture(),month:'2026-10',message:'Como estão minhas finanças?',userId:'u1'});

test('resumo usa caixa e consumo distintos, centavos e dados reduzidos',()=>{
  const facts=maxFinancialContext(fixture(),'2026-10');
  assert.equal(facts.caixa.despesas.centavos,15000);assert.equal(facts.consumo.despesas.centavos,20000);
  assert.equal(facts.saldoRegistradoEmContas.centavos,295000);assert.equal(facts.pendenciasDoMes.centavos,5000);
  assert.equal(facts.categorias[0].gasto.centavos,20000);assert.ok(!JSON.stringify(facts).includes('PRIVATE'));
  assert.throws(()=>maxFinancialContext(fixture(),'2026-13'),/mês válido/);
});
test('sem chave preserva cálculo local e identifica origem sem chamar provedor',async()=>{
  const ai=createMaxAI({}, {generate:()=>assert.fail('Não deve chamar')});
  assert.equal(ai.status().configured,false);const reply=await ai.reply(args());assert.equal(reply.source,'local');assert.ok(reply.notice);
});
test('Gemini recebe fatos calculados, histórico limitado e chave nunca aparece na saída',async()=>{
  let options;const state=fixture();state.messages=Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',content:'Mensagem '+i}));
  const ai=createMaxAI({GEMINI_API_KEY:'PRIVATE KEY'},{generate:async input=>{options=input;return {text:'Seu consumo é de R$ 200,00.',finishReason:'stop'};}});
  const before=structuredClone(state);const reply=await ai.reply({...args(),state});
  assert.equal(reply.source,'gemini');assert.equal(options.messages.length,9);assert.equal(options.maxRetries,0);
  const question=JSON.parse(options.messages.at(-1).content);assert.equal(question.resumoFinanceiro.consumo.despesas.centavos,20000);
  assert.ok(!JSON.stringify(options.messages).includes('PRIVATE'));assert.ok(!JSON.stringify(reply).includes('PRIVATE KEY'));assert.deepEqual(state,before);
});
test('erro e resposta truncada usam fallback sem expor mensagens do provedor',async()=>{
  for(const generate of [async()=>{throw new Error('SECRET KEY');},async()=>({text:'Parcial',finishReason:'length'}),async()=>({text:'',finishReason:'stop'})]){
    const reply=await createMaxAI({GEMINI_API_KEY:'x'},{generate}).reply(args());assert.equal(reply.source,'local');assert.ok(!JSON.stringify(reply).includes('SECRET'));
  }
});
test('limita chamadas por usuário, libera após janela e não bloqueia outro usuário',async()=>{
  let time=0,calls=0;const ai=createMaxAI({GEMINI_API_KEY:'x'},{now:()=>time,generate:async()=>{calls++;return {text:'Resposta',finishReason:'stop'};}});
  for(let i=0;i<6;i++)assert.equal((await ai.reply(args())).source,'gemini');
  assert.equal((await ai.reply(args())).source,'local');assert.equal(calls,6);
  assert.equal((await ai.reply({...args(),userId:'u2'})).source,'gemini');
  time=60001;assert.equal((await ai.reply(args())).source,'gemini');
});
test('bloqueia chamadas simultâneas do mesmo usuário',async()=>{
  let done;const ai=createMaxAI({GEMINI_API_KEY:'x'},{generate:()=>new Promise(resolve=>{done=resolve;})});
  const pending=ai.reply(args());assert.equal((await ai.reply(args())).source,'local');done({text:'Ok',finishReason:'stop'});assert.equal((await pending).source,'gemini');
});

test('SDK real serializa instruções e autenticação Google com transporte simulado',async()=>{
  let request;
  const ai=createMaxAI({GEMINI_API_KEY:'test-key'},{fetcher:async(url,options)=>{
    request={url:String(url),body:JSON.parse(options.body),headers:new Headers(options.headers)};
    return Response.json({candidates:[{content:{role:'model',parts:[{text:'Seu consumo registrado é R$ 200,00.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:10,totalTokenCount:110}});
  }});
  const result=await ai.reply(args());assert.equal(result.source,'gemini');assert.match(result.content,/200,00/);
  assert.match(request.url,/generativelanguage.googleapis.com/);assert.equal(request.headers.get('x-goog-api-key'),'test-key');
  assert.ok(request.body.systemInstruction);assert.ok(!JSON.stringify(request.body).includes('PRIVATE'));
});
