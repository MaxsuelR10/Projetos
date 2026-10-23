import {createAuth} from './auth.mjs';
import {createStore} from './storage.mjs';
export function createApi(env=process.env,{auth,storeFactory=createStore}={}){
  const production=env.VERCEL==='1'||env.NODE_ENV==='production';
  const allowed=new Set((env.APP_ORIGIN||'').split(',').filter(Boolean));
  auth??=createAuth({url:env.NEON_AUTH_URL,secret:env.SESSION_SECRET,secure:production});
  async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>10000000)throw Object.assign(new Error('Arquivo excede 10 MB.'),{status:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Object.assign(new Error('JSON inválido.'),{status:400});}}
  return async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    try{
      const host=req.headers.host,local=!production&&/^((127\.0\.0\.1)|(localhost))(:\d+)?$/.test(host||'');
      const expected=local?`http://${host}`:null;
      if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&!allowed.has(req.headers.origin)&&req.headers.origin!==expected))return send(403,{error:'Origem não permitida.'});
      if(!['GET','POST','PUT'].includes(req.method))return send(405,{error:'Método não permitido.'});
      if(req.method!=='GET'&&!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON obrigatório.'});
      if(req.method!=='GET'&&!req.headers.origin)return send(403,{error:'Origem obrigatória.'});
      const path=new URL(req.url,'http://localhost').pathname;
      if(['/api/login','/api/signup'].includes(path)&&req.method==='POST'){
        res.setHeader('Set-Cookie',await auth.login(await body(req),path==='/api/signup',req.headers.origin));return send(200,{ok:true});
      }
      if(path==='/api/logout'&&req.method==='POST'){res.setHeader('Set-Cookie',await auth.logout(req));return send(200,{ok:true});}
      const user=await auth.user(req);if(!user?.id)return send(401,{error:'Entre na sua conta para continuar.'});
      if(path==='/api/session'&&req.method==='GET')return send(200,{user:{id:user.id,name:user.name,email:user.email}});
      if(path!=='/api/state')return send(404,{error:'Rota não encontrada.'});
      const store=storeFactory(env.DATABASE_URL,'user:'+user.id);
      if(req.method==='GET')return send(200,await store.read());
      if(req.method!=='PUT')return send(405,{error:'Método não permitido.'});
      const input=await body(req);
      try{return send(200,await store.write(input.state,input.revision));}catch(err){if(!err.status&&!err.code)err.status=400;throw err;}
    }catch(err){send(err.status||503,{error:err.status?err.message:'Serviço indisponível. Tente novamente.'});}
  };
}
