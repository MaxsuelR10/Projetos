import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemoteStorage} from '../dist/remote-storage.mjs';
test('serializa gravações e mantém a versão devolvida pelo servidor',async()=>{
  const sent=[];const statuses=[];
  const remote=createRemoteStorage({onStatus:s=>statuses.push(s),fetcher:async(url,opts)=>{
    if(opts.method==='GET')return Response.json({revision:7,state:{ok:true}});
    const body=JSON.parse(opts.body);sent.push(body);return Response.json({revision:body.revision+1});
  }});
  assert.deepEqual(await remote.load(),{ok:true});
  await Promise.all([remote.save({value:1}),remote.save({value:2})]);
  assert.deepEqual(sent.map(x=>x.revision),[7,8]);assert.equal(remote.pending,0);assert.equal(statuses.at(-1),'Salvo no Neon');
});
test('conflito bloqueia gravações seguintes sem sobrescrever o banco',async()=>{
  let writes=0;
  const remote=createRemoteStorage({fetcher:async(url,opts)=>{if(opts.method==='GET')return Response.json({revision:1,state:{}});writes++;return Response.json({error:'Conflito'},{status:409});}});
  await remote.load();await assert.rejects(remote.save({}),/Conflito/);await assert.rejects(remote.save({}),/interrompida/);assert.equal(writes,1);
});

test('flush aguarda a gravação e fornece revisão atual para análise do Max',async()=>{
  let release;const remote=createRemoteStorage({fetcher:async(url,opts)=>opts.method==='GET'?Response.json({revision:7,state:{}}):new Promise(resolve=>{release=()=>resolve(Response.json({revision:8}));})});
  await remote.load();const save=remote.save({value:1});let finished=false;const flush=remote.flush().then(revision=>{finished=true;return revision;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);release();await save;assert.equal(await flush,8);
});
