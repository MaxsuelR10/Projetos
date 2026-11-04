(() => {
  let installPrompt = null;
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const refresh = () => document.querySelectorAll('install-app').forEach(element => element.render());
  window.addEventListener('beforeinstallprompt', event => {event.preventDefault();installPrompt = event;refresh();});
  window.addEventListener('appinstalled', () => {installPrompt = null;refresh();});
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(() => {});
  customElements.define('install-app', class extends HTMLElement {
    connectedCallback(){this.render();}
    render(){
      if(installed() || !mobile()){this.hidden=true;return;}
      this.hidden=false;
      const help=ios()?'No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Ative “Abrir como app” se aparecer.':'No menu do navegador, toque em “Instalar app” ou “Adicionar à tela inicial”.';
      this.innerHTML=`<div class="install-card"><div><strong>Tenha o app na tela inicial</strong><p>Abra o Finanças do Max sem a barra de endereço do navegador.</p></div><button type="button" class="btn install-button">${installPrompt?'Instalar aplicativo':'Como instalar'}</button><p class="install-help" hidden></p></div>`;
      this.querySelector('button').addEventListener('click',async()=>{
        if(installPrompt){const prompt=installPrompt;installPrompt=null;try{await prompt.prompt();await prompt.userChoice;}catch{}refresh();return;}
        const node=this.querySelector('.install-help');node.textContent=help;node.hidden=false;
      });
    }
  });
})();
