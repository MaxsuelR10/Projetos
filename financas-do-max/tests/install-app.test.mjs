import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../dist/install-app.js',import.meta.url),'utf8');
function setup({ios=false,standalone=false}={}){
 const events={},nodes=[];let registered=false,ctor;
 class Element {constructor(){this.hidden=false;this.button={addEventListener:(_,fn)=>this.click=fn};this.help={hidden:true,textContent:''};nodes.push(this);}set innerHTML(value){this.markup=value;}querySelector(selector){return selector==='button'?this.button:this.help;}}
 const platform={window:{isSecureContext:true,addEventListener:(name,fn)=>events[name]=fn},navigator:{userAgent:ios?'iPhone':'Android',platform:ios?'iPhone':'Linux',serviceWorker:{register:async()=>{registered=true;}}},matchMedia:()=>({matches:standalone}),document:{querySelectorAll:()=>nodes},HTMLElement:Element,customElements:{define:(_,cls)=>ctor=cls}};
 vm.runInNewContext(code,platform);const element=new ctor();element.connectedCallback();return {element,events,registered};
}
 test('instalação orienta iPhone e aplicativo já instalado oculta convite',()=>{const ios=setup({ios:true});assert.equal(ios.registered,true);ios.element.click();assert.match(ios.element.help.textContent,/Compartilhar/);assert.equal(ios.element.help.hidden,false);assert.equal(setup({standalone:true}).element.hidden,true);});
 test('Android oferece instalação quando navegador disponibiliza prompt',async()=>{const f=setup();let calls=0;f.events.beforeinstallprompt({preventDefault(){},prompt:async()=>{calls++;},userChoice:Promise.resolve({outcome:'accepted'})});assert.match(f.element.markup,/Instalar aplicativo/);await f.element.click();assert.equal(calls,1);});
