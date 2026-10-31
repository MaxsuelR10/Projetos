import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationUI} from '../dist/ui-notifications.mjs';
import {seedState} from '../dist/domain.mjs';

function fixture({ios=false,installed=false,permission='default',configured=true,existing=false,failSubscribe=false}={}) {
  const calls=[],messages=[],listeners={};let prompts=0,unsubscribed=0;
  const subscription={endpoint:'https://fcm.googleapis.com/test',toJSON:()=>({endpoint:'https://fcm.googleapis.com/test',keys:{}}),unsubscribe:async()=>{unsubscribed++;return true;}};
  const registration={pushManager:{getSubscription:async()=>existing?subscription:null,subscribe:async options=>{assert.equal(options.userVisibleOnly,true);return subscription;}}};
  const platform={isSecureContext:true,PushManager:class{},Notification:{permission,requestPermission:async()=>{prompts++;return permission==='denied'?'denied':'granted';}},matchMedia:()=>({matches:installed}),navigator:{userAgent:ios?'iPhone':'Android',platform:ios?'iPhone':'Linux',serviceWorker:{register:async()=>registration,ready:Promise.resolve(registration)}},document:{querySelectorAll:()=>['enable','disable','test'].map(kind=>({dataset:{notification:kind},addEventListener:(_,fn)=>{listeners[kind]=fn;}}))}};
  const ui=createNotificationUI({getState:seedState,e:String,refresh:()=>{},toast:text=>messages.push(text),platform,fetcher:async(path,options)=>{calls.push({path,body:options?.body&&JSON.parse(options.body)});if(path.endsWith('/status'))return Response.json({configured,publicKey:'YQ'});if(failSubscribe&&path.endsWith('/subscribe'))return Response.json({error:'Falha ao salvar inscrição'},{status:503});return Response.json({ok:true});}});
  ui.bind();return {ui,calls,messages,listeners,prompts:()=>prompts,unsubscribed:()=>unsubscribed};
}
test('mobile só pede permissão após toque; ativação, teste e desativação usam a inscrição do aparelho',async()=>{
  const f=fixture();await f.ui.init();assert.equal(f.prompts(),0);assert.match(f.ui.settings(),/Ativar notificações/);
  await f.listeners.enable();assert.equal(f.prompts(),1);assert.match(f.ui.settings(),/Desativar neste celular/);
  await f.listeners.test();assert.equal(f.calls.at(-1).body.endpoint,'https://fcm.googleapis.com/test');
  await f.listeners.disable();assert.equal(f.unsubscribed(),1);assert.match(f.ui.settings(),/Ativar notificações/);
});
test('iPhone orienta instalação; permissão bloqueada e configuração ausente aparecem sem falso sucesso',async()=>{
  const iphone=fixture({ios:true});await iphone.ui.init();assert.match(iphone.ui.settings(),/Tela de Início/);assert.match(iphone.ui.settings(),/disabled/);
  const blocked=fixture({permission:'denied'});await blocked.ui.init();assert.match(blocked.ui.settings(),/bloqueadas/);assert.equal(blocked.prompts(),0);
  const missing=fixture({configured:false});await missing.ui.init();assert.match(missing.ui.settings(),/aguardando configuração/);
});
test('falha no servidor desfaz inscrição local; saída remove permissão de envio deste aparelho',async()=>{
  const fail=fixture({failSubscribe:true});await fail.ui.init();await fail.listeners.enable();assert.equal(fail.unsubscribed(),1);assert.match(fail.messages.at(-1),/Falha/);assert.match(fail.ui.settings(),/Ativar notificações/);
  const existing=fixture({existing:true,permission:'granted'});await existing.ui.init();assert.equal(existing.calls.at(-1).path,'/api/notifications/subscribe');await existing.ui.disable({logout:true});assert.equal(existing.unsubscribed(),1);
});
