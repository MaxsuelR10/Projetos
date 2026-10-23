import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {seedState} from '../dist/domain.mjs';
const port=4184, workspace='integration-test-'+randomUUID();
let child,cookie='';
async function start(){
  child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),NEON_WORKSPACE:workspace},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(new Error('Servidor não iniciou.')));});
}
async function stop(){if(child){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;child=null;}}
const call=(method='GET',body,headers={},path='/api/state')=>fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{'Content-Type':'application/json',Origin:`http://127.0.0.1:${port}`,...(cookie?{Cookie:cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});
try{
  await start();
  assert.equal((await call()).status,401);
  const credentials={email:workspace+'@example.invalid',password:randomUUID()+'aA1!',name:'Teste automático'};
  const signup=await call('POST',credentials,{},'/api/signup');
  assert.equal(signup.status,200,JSON.stringify(await signup.json()));
  cookie=signup.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('GET',undefined,{},'/api/session')).status,200);
  assert.deepEqual(await (await call()).json(),{revision:0,state:null});
  const state=seedState('2026-10-22');state.profile.name='Teste Neon';
  assert.equal((await call('PUT',{revision:0,state})).status,200);
  assert.deepEqual((await (await call()).json()).state,state);
  const changed=structuredClone(state);changed.profile.name='Teste Neon atualizado';
  const results=await Promise.all([call('PUT',{revision:1,state:changed}),call('PUT',{revision:1,state})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await call('PUT',{revision:2,state:{}})).status,400);
  assert.equal((await call('PUT',{revision:2,state},{Origin:'https://example.com'})).status,403);
  await stop();await start();
  const saved=await (await call()).json();assert.equal(saved.revision,2);assert.ok(saved.state.profile.name.startsWith('Teste Neon'));
  const firstCookie=cookie;cookie='';
  const second=await call('POST',{...credentials,email:'second-'+credentials.email},{},'/api/signup');assert.equal(second.status,200);cookie=second.headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await (await call()).json(),{revision:0,state:null});
  cookie=firstCookie;
  assert.equal((await call('POST',{}, {},'/api/logout')).status,200);cookie='';assert.equal((await call()).status,401);
  const login=await call('POST',credentials,{},'/api/login');assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await (await call()).json()).revision,2);
  console.log('PASS: Neon Auth real: cadastro, login, sessão, logout, isolamento de dois usuários; Neon: gravação/leitura, concorrência, validação, origem e persistência após reinício. Contas de teste isoladas:',workspace);
}finally{await stop();}
