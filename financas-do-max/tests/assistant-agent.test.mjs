import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {seedState,accountBalance,financialReport} from '../dist/domain.mjs';
import {invoiceFor} from '../dist/billing.mjs';
import {localInterpret,reais,todayBR} from '../assistant-intents.mjs';
import {prepareOperation} from '../assistant-tools.mjs';
import {createAssistant} from '../assistant-service.mjs';
import {createAssistantRepository} from '../assistant-repository.mjs';
import {createApi} from '../http-api.mjs';
import {memoryPrisma} from './helpers/prisma-memory.mjs';
const date=new Date('2026-10-28T12:00:00Z');
export function fixture(){
  const state=seedState('2026-10-28');state.transactions=[];state.messages=[];state.accounts=state.accounts.slice(0,1);state.accounts[0].name='Principal';state.cards[0].name='Nubank';state.cards[0].closingDay=30;state.cards[0].dueDay=31;
  const client=memoryPrisma({alice:state,bob:state}),repository=createAssistantRepository(null,{client});
  const service=createAssistant({repository,env:{},now:()=>date});
  const ask=async(message,extra={})=>service.chat('alice',{message,month:'2026-10',revision:(await repository.read('alice')).revision,requestId:randomUUID(),...extra});
  return {state,client,repository,service,ask};
}
test('despesa exige prévia; categoria, conta, centavos, saldo e dashboard são consistentes após confirmar',async()=>{
  const f=fixture(),p=await f.ask('Abasteci 30 reais de gasolina no Classic.');assert.equal(p.pending.preview.amount,3000);assert.equal(p.pending.preview.category,'Transporte');assert.equal(p.pending.preview.account,'Principal');
  assert.equal((await f.repository.read('alice')).state.transactions.length,0);
  const saved=await f.service.confirm('alice',p.pending.token);assert.equal(saved.state.transactions.length,1);assert.equal(accountBalance(saved.state,'bank'),f.state.accounts[0].openingBalance-3000);assert.equal(financialReport(saved.state,'2026-10').summary.expense,3000);
});
test('receita de 2 mil e datas relativas civis do Brasil',async()=>{
  const f=fixture();const p=await f.ask('Recebi 2 mil reais de salário.',{editedIntent:{intent:'create_transaction',type:'income',amount:'2 mil',description:'Salário',categoryName:'Outros',date:'yesterday'}});const saved=await f.service.confirm('alice',p.pending.token);assert.equal(saved.state.transactions[0].amount,200000);assert.equal(saved.state.transactions[0].date,'2026-10-27');assert.equal(accountBalance(saved.state,'bank'),440000);assert.equal(todayBR(new Date('2026-10-28T01:00:00Z')),'2026-10-27');assert.equal(reais('1.234,56'),123456);
});
test('comando sem valor, contas ambíguas, categoria desconhecida e data inválida pedem esclarecimento',async()=>{
  const f=fixture();assert.equal((await f.ask('Gastei gasolina')).clarification,true);
  const raw=localInterpret('Gastei 30 de gasolina ontem');
  const s=structuredClone(f.state);s.accounts.push({...s.accounts[0],id:'other',name:'Outra'});
  assert.throws(()=>prepareOperation(s,raw,'Gastei 30 de gasolina ontem','2026-10-28'),/conta/);
  assert.throws(()=>prepareOperation(f.state,{...raw,categoryName:'inventada'},'gasolina','2026-10-28'),/categoria/);
  assert.throws(()=>prepareOperation(f.state,{...raw,date:'2026-02-30'},'gasolina','2026-10-28'),/data/);
});
test('compra parcelada usa regras de fatura sem débito imediato nem duplicação de consumo',async()=>{
  const f=fixture(),p=await f.ask('Comprei um tênis de 300 reais em 3 vezes no Nubank.');assert.ok(p.pending,p.content);
  const {state}=await f.service.confirm('alice',p.pending.token);assert.equal(state.transactions.length,1);assert.equal(state.transactions[0].installmentCount,3);assert.equal(invoiceFor(state,state.cards[0],'2026-10').total,10000);assert.equal(accountBalance(state,'bank'),240000);assert.equal(invoiceFor(state,state.cards[0],'2026-11').total,10000);
});
test('consulta de saldo, mês, categoria e fatura não grava',async()=>{
  const f=fixture();for(const message of ['Qual meu saldo disponível?','Quanto gastei este mês?','Quanto gastei com combustível?','Quais são minhas maiores despesas?','Quanto tenho de fatura no cartão este mês?']){const r=await f.ask(message);assert.equal(r.pending,undefined);assert.ok(r.content);}
  assert.equal((await f.repository.read('alice')).revision,1);
});
test('edição e exclusão exigem nova confirmação; exclusão preserva o histórico',async()=>{
  const f=fixture();let p=await f.ask('Abasteci 30 reais de gasolina');await f.service.confirm('alice',p.pending.token);
  p=await f.ask('Altera o abastecimento de 30 para 40 reais.');assert.ok(p.pending,p.content);assert.equal((await f.repository.read('alice')).state.transactions[0].amount,3000);await f.service.confirm('alice',p.pending.token);
  p=await f.ask('Exclui a última despesa que cadastrei.');const saved=await f.service.confirm('alice',p.pending.token);assert.equal(saved.state.transactions[0].status,'cancelled');assert.equal(saved.state.transactions[0].amount,4000);assert.equal(accountBalance(saved.state,'bank'),240000);assert.equal(saved.state.auditLog.length,3);
});
test('Gemini indisponível faz fallback sem transmitir resumo financeiro; saída inválida também',async()=>{
  const f=fixture();for(const generate of [async input=>{assert.ok(!input.prompt.includes('openingBalance'));throw new Error('secret');},async()=>({output:{intent:'execute_sql',sql:'DROP'}})]){
    const service=createAssistant({repository:f.repository,env:{GEMINI_API_KEY:'mock'},generate,now:()=>date});const r=await service.chat('alice',{message:'Gastei 30 de gasolina',month:'2026-10',revision:1,requestId:randomUUID()});assert.equal(r.source,'local');assert.ok(r.pending);assert.ok(!JSON.stringify(r).includes('secret'));
  }
});
test('Gemini estruturado gera somente intenção, sem gravação automática',async()=>{
  const f=fixture();const service=createAssistant({repository:f.repository,env:{GEMINI_API_KEY:'mock'},generate:async()=>({output:{intent:'create_transaction',type:'expense',amount:'30',description:'Gasolina',categoryName:'Transporte'}}),now:()=>date});const r=await service.chat('alice',{message:'Abasteci trinta reais',month:'2026-10',revision:1,requestId:randomUUID()});assert.equal(r.source,'gemini');assert.ok(r.pending);assert.equal((await f.repository.read('alice')).state.transactions.length,0);
});
test('confirmação concorrente e repetida é idempotente; outro usuário não pode usar token',async()=>{
  const f=fixture(),p=await f.ask('Gastei 30 de gasolina');await assert.rejects(f.service.confirm('bob',p.pending.token),{status:409});
  const results=await Promise.all([f.service.confirm('alice',p.pending.token),f.service.confirm('alice',p.pending.token)]);assert.equal(results.filter(x=>!x.replayed).length,1);assert.equal((await f.repository.read('alice')).state.transactions.length,1);assert.equal((await f.repository.read('bob')).state.transactions.length,0);
});
test('idempotência de solicitação, token adulterado, cancelamento e expiração',async()=>{
  const f=fixture(),requestId=randomUUID();const p=await f.ask('Gastei 30 de gasolina',{requestId});const retry=await f.ask('Gastei 30 de gasolina',{requestId});assert.equal(p.pending.token,retry.pending.token);
  await assert.rejects(f.service.confirm('alice','x'),{status:400});await f.service.cancel('alice',p.pending.token);await assert.rejects(f.service.confirm('alice',p.pending.token),{status:409});
  const next=await f.ask('Gastei 30 de gasolina');const late=createAssistant({repository:f.repository,env:{},now:()=>new Date('2026-10-28T12:06:00Z')});await assert.rejects(late.confirm('alice',next.pending.token),{status:409});
});
test('revisão antiga invalida prévia e preserva alterações concorrentes',async()=>{
  const f=fixture(),p=await f.ask('Gastei 30 de gasolina');await f.client.financeState.updateMany({where:{workspaceId:'user:alice',revision:1},data:{payload:f.state}});await assert.rejects(f.service.confirm('alice',p.pending.token),{status:409});assert.equal((await f.repository.read('alice')).state.transactions.length,0);
});
test('falha de persistência reverte consumo do token na mesma transação',async()=>{
  const f=fixture(),p=await f.ask('Gastei 30 de gasolina');const original=f.client.financeState.updateMany;
  f.client.financeState.updateMany=async()=>({count:0});await assert.rejects(f.service.confirm('alice',p.pending.token),{status:409});
  f.client.financeState.updateMany=original;const retry=await f.service.confirm('alice',p.pending.token);assert.equal(retry.state.transactions.length,1);
});
test('rotas verificam sessão, origem e identidade vinda da sessão',async t=>{
  const f=fixture();const api=createApi({APP_ORIGIN:'http://app.test'},{auth:{user:async req=>req.headers.cookie?{id:'alice'}:null},assistant:f.service,storeFactory:()=>({read:()=>f.repository.read('alice')})});const server=createServer(api);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.close();server.closeAllConnections();});const base=`http://127.0.0.1:${server.address().port}`;
  const call=(path,data,cookie='yes',origin='http://app.test')=>fetch(base+path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
  const input={message:'Gastei 30 de gasolina',month:'2026-10',revision:1,requestId:randomUUID(),userId:'bob'};
  assert.equal((await call('/api/assistant/chat',input,'')).status,401);assert.equal((await call('/api/assistant/chat',input,'yes','https://evil.test')).status,403);
  const preview=await (await call('/api/assistant/chat',input)).json();assert.ok(preview.pending);const saved=await (await call('/api/assistant/confirm',{token:preview.pending.token,userId:'bob'})).json();assert.equal(saved.state.transactions.length,1);assert.equal((await f.repository.read('bob')).state.transactions.length,0);
});
