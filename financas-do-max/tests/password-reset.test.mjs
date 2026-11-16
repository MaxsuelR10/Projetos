import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createAuth} from '../auth.mjs';
import {createApi} from '../http-api.mjs';

test('recuperação usa a origem autorizada e o token do provedor sem acessar dados financeiros',async t=>{
  const origin='https://app.example.test';
  const email='teste@example.test';
  const token='token-de-teste';
  let password='senha-antiga';
  let validToken=false;
  const requests=[];

  const auth=createAuth({
    url:'https://auth.example.test',
    secret:'s'.repeat(32),
    secure:true,
    fetcher:async(url,options)=>{
      assert.equal(options.method,'POST');
      assert.equal(options.headers.Origin,origin);
      assert.equal(options.headers.Cookie,undefined);
      const path=new URL(url).pathname;
      const input=JSON.parse(options.body);
      requests.push({path,input});
      if(path==='/request-password-reset'){
        if(input.email===email)validToken=true;
        if(input.email==='limite@example.test')return new Response('Too many requests',{status:429});
        return Response.json({status:true});
      }
      assert.equal(path,'/reset-password');
      if(!validToken||input.token!==token){
        return Response.json({code:'INVALID_TOKEN',message:'Detalhes privados do provedor'},{status:400});
      }
      validToken=false;
      password=input.newPassword;
      return Response.json({status:true});
    }
  });
  const api=createApi({APP_ORIGIN:origin,NODE_ENV:'production'},{
    auth,
    storeFactory:()=>assert.fail('A recuperação não deve acessar o armazenamento financeiro.')
  });
  const server=createServer(api);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}/api/password-reset`;
  const send=(path,body,headers={})=>fetch(`${base}/${path}`,{
    method:'POST',
    headers:{Origin:origin,'Content-Type':'application/json',...headers},
    body:JSON.stringify(body)
  });

  assert.equal((await send('request',{email},{Origin:'https://foreign.test'})).status,403);
  assert.equal((await send('request',{email},{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await send('request',{email:'sem-arroba'})).status,400);
  assert.equal(requests.length,0);

  const requested=await send('request',{email:` ${email} `,redirectTo:'https://foreign.test'});
  const unknown=await send('request',{email:'ausente@example.test'});
  assert.equal(requested.status,200);
  assert.equal(unknown.status,200);
  assert.deepEqual(await requested.json(),await unknown.json());
  assert.deepEqual(requests[0],{path:'/request-password-reset',input:{email,redirectTo:origin+'/?redefinir-senha=1'}});
  assert.equal((await send('request',{email:'limite@example.test'})).status,429);

  assert.equal((await send('confirm',{token,newPassword:'curta'})).status,400);
  assert.equal((await send('confirm',{newPassword:'senha-nova'})).status,400);
  assert.equal(requests.length,3);
  const invalid=await send('confirm',{token:'inválido',newPassword:'senha-nova'});
  assert.equal(invalid.status,400);
  assert.match((await invalid.json()).error,/link de redefinição é inválido/);
  assert.equal(password,'senha-antiga');

  const confirmed=await send('confirm',{token,newPassword:'senha-nova'},{Cookie:'__Host-fm-session=qualquer'});
  assert.equal(confirmed.status,200);
  assert.equal(confirmed.headers.get('cache-control'),'no-store');
  assert.match(confirmed.headers.get('set-cookie'),/^__Host-fm-session=; .*Max-Age=0; Secure$/);
  assert.equal(password,'senha-nova');
  assert.equal((await send('confirm',{token,newPassword:'outra-senha'})).status,400);
  assert.equal(password,'senha-nova');
});
