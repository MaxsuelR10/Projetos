import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {seedState,validateState} from '../dist/domain.mjs';
import {financialNotifications,notificationDate} from '../dist/notification-rules.mjs';
import {createPushService,validateSubscription,cronAuthorized} from '../push-service.mjs';
import {createApi} from '../http-api.mjs';
import {applyInputMasks} from '../dist/input-masks.mjs';

function fixture(){const s=seedState();s.transactions=[];s.cards=[];s.agents=[];s.categories.forEach(c=>c.budget=0);return s;}
const bill=(s,extra={})=>({id:'bill',description:'Conta teste',type:'expense',amount:8000,date:'2026-10-31',dueDate:'2026-11-02',status:'pending',accountId:s.accounts[0].id,categoryId:s.categories[0].id,...extra});
test('regressão mobile: digitação sequencial em campos sem maxlength não apaga cada tecla',()=>{
  let handler;const input={dataset:{mask:'integer'},maxLength:-1,value:'',addEventListener:(name,fn)=>{if(name==='input')handler=fn;}};
  applyInputMasks({querySelectorAll:selector=>selector.includes('currency')?[]:[input]});
  input.value+='3';handler();assert.equal(input.value,'3');input.value+='1';handler();assert.equal(input.value,'31');
  input.value='';handler();assert.equal(input.value,'');
});
test('cartões novos dispensam números; backups anteriores continuam aceitos',()=>{
  const s=seedState();delete s.cards[0].last4;assert.equal(validateState(s),s);
  s.cards[0].last4='4242';assert.equal(validateState(s),s);
  for(const day of [0,32,1.5]){s.cards[0].dueDay=day;assert.throws(()=>validateState(s),/Cartão inválido/);}
});
test('vencimentos cruzam o mês, excluem contas pagas/canceladas e mantêm chaves estáveis',()=>{
  const s=fixture();s.transactions=[bill(s),bill(s,{id:'paid',status:'completed'}),bill(s,{id:'cancelled',status:'cancelled'}),bill(s,{id:'far',dueDate:'2026-11-10'})];
  const events=financialNotifications(s,'2026-10-31');assert.equal(events.length,1);assert.match(events[0].key,/soon$/);
  assert.equal(financialNotifications(s,'2026-11-01')[0].key,events[0].key);
  assert.match(financialNotifications(s,'2026-11-02')[0].key,/today$/);
  assert.equal(financialNotifications(s,'2026-11-03').length,0);
  assert.equal(notificationDate(new Date('2026-11-01T01:00:00Z')),'2026-10-31');
});
test('faturas: virada do mês e fevereiro, sem notificar fatura vazia',()=>{
  const s=fixture();s.cards=[{id:'c',name:'Cartão',accountId:s.accounts[0].id,limit:100000,closingDay:25,dueDay:2}];
  s.transactions=[bill(s,{cardId:'c',date:'2026-10-20',status:'completed',dueDate:undefined})];
  assert.match(financialNotifications(s,'2026-10-31')[0].key,/2026-11-02/);
  s.transactions=[];assert.equal(financialNotifications(s,'2026-10-31').length,0);
  s.cards[0].dueDay=31;s.cards[0].closingDay=20;s.transactions=[bill(s,{cardId:'c',date:'2027-02-10',status:'completed'})];
  assert.match(financialNotifications(s,'2027-02-26')[0].key,/2027-02-28/);
});
test('orçamento usa consumo sem duplicar pagamento de fatura; 80%, 100%, ocultos e zero',()=>{
  const s=fixture();s.profile.monthlyBudget=10000;s.transactions=[bill(s,{status:'completed',hidden:true}),bill(s,{id:'payment',invoicePaymentId:'payment',amount:8000,status:'completed'})];
  assert.equal(financialNotifications(s,'2026-10-31').filter(e=>e.key.startsWith('budget:'))[0].key,'budget:monthly:2026-10:80');
  s.transactions[0].amount=10000;assert.match(financialNotifications(s,'2026-10-31')[0].key,/:100$/);
  s.profile.monthlyBudget=0;assert.equal(financialNotifications(s,'2026-10-31').length,0);
});
test('nova conta só dispara no cadastro, não na edição ou importação inicial',()=>{
  const s=fixture(),previous=structuredClone(s);s.transactions=[bill(s,{dueDate:'2026-12-10'})];
  assert.equal(financialNotifications(s,'2026-10-31',{previous}).length,1);
  assert.equal(financialNotifications(s,'2026-10-31',{previous:s}).length,0);
  assert.equal(financialNotifications(s,'2026-10-31').length,0);
});
test('inscrições rejeitam endereços locais, credenciais, portas e chaves inválidas; cron exige segredo',()=>{
  const input={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
  assert.equal(validateSubscription(input).endpoint,input.endpoint);
  for(const endpoint of ['http://127.0.0.1/x','https://evil.test/x','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:8080/x'])assert.throws(()=>validateSubscription({...input,endpoint}));
  assert.throws(()=>validateSubscription({...input,keys:{}}));
  assert.equal(cronAuthorized('Bearer secret','secret'),true);assert.equal(cronAuthorized('Bearer undefined',undefined),false);assert.equal(cronAuthorized('x','secret'),false);
});
test('envio é por usuário, deduplica, libera falha temporária e remove inscrição expirada',async()=>{
  const s=fixture();s.transactions=[bill(s)];let sent=0,fail=false,expired=false,removed=false;
  const claims=new Set(),repository={pendingKeys:async()=>[],subscriptions:async id=>id==='alice'?[{id:'s',subscription:{endpoint:'https://fcm.googleapis.com/test'}}]:[],claim:async(id,key)=>{if(claims.has(key))return null;claims.add(key);return 'token';},finish:async()=>{},release:async(id,key)=>claims.delete(key),remove:async()=>{removed=true;}};
  const service=createPushService({DATABASE_URL:'test',CRON_SECRET:'secret',VAPID_PUBLIC_KEY:'test',VAPID_PRIVATE_KEY:'private',VAPID_SUBJECT:'https://app.test'},{repository,now:()=>new Date('2026-10-31T12:00:00Z'),send:async(sub,payload)=>{if(fail)throw {statusCode:expired?410:503};sent++;assert.equal(JSON.parse(payload).body.includes('Conta teste'),false);}});
  await service.dispatch('bob',s);assert.equal(sent,0);await service.dispatch('alice',s);await service.dispatch('alice',s);assert.equal(sent,1);
  claims.clear();fail=true;assert.equal((await service.dispatch('alice',s)).failed,1);assert.equal(claims.size,0);
  fail=false;await service.dispatch('alice',s);assert.equal(sent,2);
  claims.clear();fail=true;expired=true;await service.dispatch('alice',s);assert.equal(removed,true);
});
test('API: isolamento por sessão, origem, cron sem sessão e segredo obrigatório',async t=>{
  let actor,ran=0;const api=createApi({CRON_SECRET:'secret',APP_ORIGIN:'https://app.test'},{assistant:{},auth:{user:async req=>req.headers.cookie?{id:'alice'}:null},push:{status:()=>({configured:true}),subscribe:async id=>{actor=id;return {ok:true};},run:async()=>{ran++;return {sent:1,failed:0};}}});
  const server=createServer(api);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/api/notifications/status')).status,401);
  assert.equal((await fetch(base+'/api/notifications/cron')).status,401);
  assert.equal((await fetch(base+'/api/notifications/cron',{headers:{Authorization:'Bearer secret'}})).status,200);assert.equal(ran,1);
  const send=origin=>fetch(base+'/api/notifications/subscribe',{method:'POST',headers:{Origin:origin,Cookie:'yes','Content-Type':'application/json'},body:'{"userId":"bob"}'});
  assert.equal((await send('https://foreign.test')).status,403);assert.equal((await send('https://app.test')).status,200);assert.equal(actor,'alice');
});
