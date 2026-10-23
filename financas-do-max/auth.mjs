import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
export function createAuth({url,secret,fetcher=fetch,secure=false}){
  if(!url||!secret||secret.length<32)throw new Error('Configure NEON_AUTH_URL e SESSION_SECRET (mínimo 32 caracteres).');
  const key=createHash('sha256').update(secret).digest();
  const name=secure?'__Host-fm-session':'fm-session';
  const cookie=(value,age=604800)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
  function seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64url');}
  function unseal(req){try{const value=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);if(!value)return null;const bytes=Buffer.from(value,'base64url'),decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(-16));const obj=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString());return obj.expires>Date.now()?obj:null;}catch{return null;}}
  async function upstream(path,{method='GET',body,cookies,origin}={}){
    const res=await fetcher(url.replace(/\/$/,'')+'/'+path,{method,headers:{'Content-Type':'application/json',...(cookies?{Cookie:cookies}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'error'});
    const data=await res.json();return {res,data};
  }
  return {
    async user(req){const session=unseal(req);if(!session)return null;const {res,data}=await upstream('get-session',{cookies:session.cookies});if(!res.ok)return null;return data?.user||data?.data?.user||null;},
    async login(input,signup,origin){
      if(typeof input.email!=='string'||input.email.length>254||typeof input.password!=='string'||input.password.length<8||input.password.length>128)throw Object.assign(new Error('Informe um e-mail e uma senha de 8 a 128 caracteres.'),{status:400});
      const {res,data}=await upstream(signup?'sign-up/email':'sign-in/email',{method:'POST',body:{email:input.email,password:input.password,...(signup?{name:String(input.name||'Usuário').slice(0,100)}:{})},origin});
      if(!res.ok)throw Object.assign(new Error(signup?'Não foi possível criar a conta. Confira seus dados.':'E-mail ou senha inválidos.'),{status:res.status===429?429:400});
      const cookies=res.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
      if(!cookies)throw Object.assign(new Error('A conta precisa de confirmação antes de entrar.'),{status:400});
      return cookie(seal({cookies,expires:Date.now()+604800000}));
    },
    async logout(req){const session=unseal(req);if(session)await upstream('sign-out',{method:'POST',cookies:session.cookies,body:{}});return cookie('',0);}
  };
}
