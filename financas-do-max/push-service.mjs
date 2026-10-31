import webpush from 'web-push';
import {timingSafeEqual} from 'node:crypto';
import {createPushRepository} from './push-repository.mjs';
import {financialNotifications,notificationDate} from './dist/notification-rules.mjs';

const fail=message=>Object.assign(new Error(message),{status:400});
export function validateSubscription(input) {
  const endpoint=input?.endpoint,keys=input?.keys;
  if(typeof endpoint!=='string'||endpoint.length>2048)throw fail('Inscrição de notificação inválida.');
  let url;try{url=new URL(endpoint);}catch{throw fail('Endereço de notificação inválido.');}
  // Only known browser push providers: prevents using this endpoint as a server-side proxy.
  const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];
  if(url.protocol!=='https:'||url.port||url.username||url.password||!hosts.some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))throw fail('Provedor de notificações não permitido.');
  if(!keys||!/^[-_A-Za-z0-9]{87}$/.test(keys.p256dh)||!/^[-_A-Za-z0-9]{22}$/.test(keys.auth))throw fail('Chaves de notificação inválidas.');
  return {endpoint,keys:{p256dh:keys.p256dh,auth:keys.auth},expirationTime:null};
}
export function cronAuthorized(header,secret) {
  if(!secret||typeof header!=='string')return false;
  const got=Buffer.from(header),expected=Buffer.from('Bearer '+secret);
  return got.length===expected.length&&timingSafeEqual(got,expected);
}
export function createPushService(env,{repository,readState,send=webpush.sendNotification,now=()=>new Date()}={}) {
  const configured=Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT&&env.DATABASE_URL&&env.CRON_SECRET);
  let repo=repository;
  const db=()=>repo??=createPushRepository(env.DATABASE_URL);
  const options=()=>({vapidDetails:{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY},TTL:3600,timeout:10000});
  const requireConfig=()=>{if(!configured)throw Object.assign(new Error('Notificações ainda não configuradas no servidor.'),{status:503});};
  async function dispatch(userId,state,extra={}) {
    if(!configured||!state)return {sent:0,failed:0};
    const events=financialNotifications(state,notificationDate(now()),extra);
    let sent=0,failed=0;
    for(const sub of await db().subscriptions(userId)) {
      const retry=await db().pendingKeys(sub.id);
      const candidates=[...events];
      for(const {event_key:key} of retry)if(!candidates.some(e=>e.key===key)&&state.transactions.some(t=>`new-bill:${t.id}`===key&&t.type==='expense'&&!t.cardId&&t.status==='pending'))candidates.push({key});
      const claimed=[];
      for(const event of candidates){const token=await db().claim(sub.id,event.key);if(token)claimed.push({event,token});}
      if(!claimed.length)continue;
      try {
        // Details stay in the authenticated app, away from the phone lock screen.
        await send(sub.subscription,JSON.stringify({title:'Finanças do Max',body:`Você tem ${claimed.length} aviso(s) sobre contas, faturas ou orçamento. Toque para conferir.`,tag:'finance-alerts',url:'/#/notifications'}),options());
        for(const {event,token} of claimed)await db().finish(sub.id,event.key,token);
        sent++;
      } catch(error) {
        if([404,410].includes(error.statusCode))await db().remove(userId,sub.subscription.endpoint);
        else {for(const {event,token} of claimed)await db().release(sub.id,event.key,token);failed++;}
      }
    }
    return {sent,failed};
  }
  return {
    status:()=>({configured,publicKey:configured?env.VAPID_PUBLIC_KEY:null}),
    async subscribe(userId,input){requireConfig();await db().subscribe(userId,validateSubscription(input));return {ok:true};},
    async remove(userId,endpoint){requireConfig();if(typeof endpoint!=='string')throw fail('Inscrição inválida.');await db().remove(userId,endpoint);return {ok:true};},
    async test(userId,endpoint){requireConfig();const sub=(await db().subscriptions(userId)).find(s=>s.subscription.endpoint===endpoint);if(!sub)throw fail('Ative as notificações neste celular primeiro.');await send(sub.subscription,JSON.stringify({title:'Finanças do Max',body:'As notificações deste celular estão funcionando.',tag:'finance-test',url:'/#/settings'}),options());return {ok:true};},
    dispatch,
    async run(){requireConfig();let sent=0,failed=0;for(const {user_id} of await db().users()){try{const state=await readState(user_id);const result=await dispatch(user_id,state);sent+=result.sent;failed+=result.failed;}catch{failed++;}}await db().cleanup();return {sent,failed};}
  };
}
