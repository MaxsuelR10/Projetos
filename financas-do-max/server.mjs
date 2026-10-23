import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from 'node:process';
import {createApi} from './http-api.mjs';
try{loadEnvFile(new URL('.env.local',import.meta.url));}catch(err){if(err.code!=='ENOENT')throw err;}
if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL no servidor.');
const api=createApi();
const root=resolve(dirname(fileURLToPath(import.meta.url)),'dist');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const port=Number(process.env.PORT||4173);
const server=createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/api/')){await api(req,res);return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Método não permitido');return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const info=await stat(path);if(!info.isFile())throw new Error('not file');
    const data=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Arquivo não encontrado');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Finanças do Max: http://127.0.0.1:${port}`));
