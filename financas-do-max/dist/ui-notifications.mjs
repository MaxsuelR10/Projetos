import {financialNotifications,notificationDate} from './notification-rules.mjs';

export function createNotificationUI({getState,e,toast,refresh,platform=globalThis,fetcher=globalThis.fetch}) {
  const {navigator,Notification,matchMedia}=platform;
  let config={configured:false},registration,subscription,busy=false,status='Consultando notificações…';
  const supported=()=>platform.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in platform&&'Notification' in platform;
  const ios=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  async function api(path,data) {
    const res=await fetcher('/api/notifications/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result=await res.json();if(!res.ok)throw new Error(result.error||'Não foi possível atualizar as notificações.');return result;
  }
  function message() {
    if(ios()&&!installed())return 'No iPhone ou iPad, adicione este site à Tela de Início e abra pelo ícone para ativar os avisos.';
    if(!supported())return 'Este navegador não oferece notificações push. Abra em um navegador compatível com HTTPS.';
    if(!config.configured)return status;
    if(Notification.permission==='denied')return 'As notificações estão bloqueadas. Libere este site nas configurações do navegador para ativar.';
    return subscription?'Notificações ativadas neste celular. Você receberá apenas avisos financeiros relevantes.':'Ative para receber avisos mesmo com o aplicativo fechado.';
  }
  async function init() {
    try {
      config=await api('status');status=config.configured?'':'Notificações aguardando configuração no servidor.';
      if(!supported())return;
      registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      await navigator.serviceWorker.ready;
      subscription=await registration.pushManager.getSubscription();
      if(subscription&&config.configured&&Notification.permission==='granted')await api('subscribe',subscription.toJSON());
    } catch{status='Serviço de notificações indisponível. Tente novamente mais tarde.';}
  }
  async function disable({logout=false}={}) {
    if(!subscription)return;
    try{await api('unsubscribe',{endpoint:subscription.endpoint});}catch(error){if(!logout)throw error;}
    await subscription.unsubscribe();subscription=null;
  }
  async function action(kind) {
    if(busy)return;busy=true;
    try {
      if(kind==='enable') {
        // The permission request starts directly in the user's tap handler (required on mobile).
        const permission=await Notification.requestPermission();
        if(permission!=='granted')throw new Error('Permissão não concedida. Você pode ativar os avisos depois.');
        const raw=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/'));
        subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});
        try{await api('subscribe',subscription.toJSON());}catch(error){await subscription.unsubscribe();subscription=null;throw error;}
        toast('Notificações ativadas neste celular.');
      } else if(kind==='disable') {await disable();toast('Notificações desativadas neste celular.');}
      else if(kind==='test') {await api('test',{endpoint:subscription.endpoint});toast('Aviso de teste enviado. Confira as notificações do celular.');}
    } catch(error){toast(error.message);}
    finally{busy=false;refresh();}
  }
  function settings() {
    const available=supported()&&config.configured&&!(ios()&&!installed())&&Notification.permission!=='denied'&&registration;
    return `<section class="panel settings-panel"><h2>Notificações no celular</h2><p role="status">${e(message())}</p><p class="hint">Faturas e contas: até 3 dias antes e no vencimento. Orçamento mensal e categorias: ao atingir 80% e 100%. Novas contas a pagar: após o cadastro. Cada aviso é enviado uma vez por celular; os detalhes ficam dentro do app.</p><div class="settings-buttons"><button class="btn primary" data-notification="${subscription?'disable':'enable'}" ${!available||busy?'disabled':''}>${subscription?'Desativar neste celular':'Ativar notificações'}</button>${subscription?'<button class="btn" data-notification="test">Enviar teste para este celular</button>':''}</div></section>`;
  }
  function alerts() {
    const events=financialNotifications(getState(),notificationDate());
    return events.length?`<div class="notification-list">${events.map(event=>`<a class="panel notification-item" href="${e(event.url)}"><strong>${e(event.title)}</strong><span>${e(event.message)}</span></a>`).join('')}</div>`:'<p class="muted">Nenhuma conta, fatura ou orçamento precisa de atenção agora.</p>';
  }
  return {init,disable,settings,alerts,count:()=>financialNotifications(getState(),notificationDate()).length,bind(){platform.document.querySelectorAll('[data-notification]').forEach(button=>button.addEventListener('click',()=>action(button.dataset.notification)));}};
}
