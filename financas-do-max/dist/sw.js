// No financial data or authenticated responses are cached on the device.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{};}catch{}
  const url=typeof payload.url==='string'&&payload.url.startsWith('/#/')?payload.url:'/#/notifications';
  event.waitUntil(self.registration.showNotification(payload.title||'Finanças do Max',{
    body:payload.body||'Há um aviso financeiro para conferir no aplicativo.',
    icon:'/finance-icon.png',badge:'/finance-icon.png',tag:payload.tag||'finance-alerts',data:{url}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||'/#/notifications',self.location.origin);
  if(url.origin!==self.location.origin)return;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows)if(new URL(client.url).origin===url.origin){await client.navigate(url.href);return client.focus();}
    return self.clients.openWindow(url.href);
  })());
});
