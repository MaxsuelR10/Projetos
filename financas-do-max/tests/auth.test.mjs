import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuth} from '../auth.mjs';
test('sessão criptografada valida no provedor; cookie adulterado é rejeitado',async()=>{
  let checked=false;
  const auth=createAuth({url:'https://auth.example.test',secret:'a'.repeat(64),secure:true,fetcher:async(url,opts)=>{
    if(url.endsWith('/sign-in/email'))return Response.json({user:{id:'u1'}},{headers:{'set-cookie':'__Secure-neonauth.session_token=upstream-secret; HttpOnly; Secure'}});
    checked=true;assert.match(opts.headers.Cookie,/upstream-secret/);return Response.json({user:{id:'u1'}});
  }});
  const header=await auth.login({email:'test@example.test',password:'password123'},false,'https://app.example.test');
  assert.match(header,/HttpOnly/);assert.match(header,/; Secure/);assert.ok(!header.includes('upstream-secret'));
  const cookie=header.split(';')[0];assert.equal((await auth.user({headers:{cookie}})).id,'u1');assert.ok(checked);
  const tampered=cookie.replace('=', '=A');assert.equal(await auth.user({headers:{cookie:tampered}}),null);
  assert.equal(await auth.user({headers:{}}),null);
});
test('configuração de produção sem segredo forte falha fechada',()=>{
  assert.throws(()=>createAuth({url:'https://auth.example.test',secret:'short'}),/Configure/);
});
