import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApi} from '../http-api.mjs';
import {createAssistantRepository} from '../assistant-repository.mjs';
import {createAssistant} from '../assistant-service.mjs';
import {memoryPrisma} from '../tests/helpers/prisma-memory.mjs';
import {seedState,validateState} from '../dist/domain.mjs';
// Deliberately never reads .env or contacts Gemini, Neon, or the login provider.
const state=seedState();for(const key of ['transactions','messages','installments','subscriptions','investments','agents'])state[key]=[];
state.accounts=state.accounts.slice(0,1);state.accounts[0].name='Principal';state.cards[0].name='Nubank';state.profile.name='Teste local';
const client=memoryPrisma({sandbox:state}),repository=createAssistantRepository(null,{client});
const store={read:()=>repository.read('sandbox'),async write(state,revision){validateState(state);const result=await client.financeState.updateMany({where:{workspaceId:'user:sandbox',revision},data:{payload:state}});if(!result.count)throw Object.assign(new Error('Os dados mudaram. Recarregue.'),{status:409});return {revision:revision+1};}};
const api=createApi({},{auth:{user:async()=>({id:'sandbox',name:'Teste local',email:'teste@local.invalid'})},assistant:createAssistant({repository,env:{}}),storeFactory:()=>store});
const root=fileURLToPath(new URL('../dist',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
createServer(async(req,res)=>{
  if(req.url.startsWith('/api/'))return api(req,res);
  try{const name=new URL(req.url,'http://localhost').pathname,path=resolve(root,'.'+(name==='/'?'/index.html':decodeURIComponent(name)));if(!path.startsWith(root+sep))throw new Error();const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end();}
}).listen(4180,'127.0.0.1',()=>console.log('Sandbox sem banco: http://127.0.0.1:4180/#/chat — dados em memória; reiniciar limpa os testes.'));
