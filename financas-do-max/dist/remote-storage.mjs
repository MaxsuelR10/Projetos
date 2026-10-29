// The database credential is only used by the local Node server.
export function createRemoteStorage({fetcher=fetch,onStatus=()=>{}}={}){
  let revision=0,tail=Promise.resolve(),failed=false,pending=0;
  async function request(method,body){
    const res=await fetcher('/api/state',{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    const result=await res.json();
    if(!res.ok)throw new Error(result.error||'Não foi possível sincronizar com o Neon.');
    return result;
  }
  return {
    acceptSnapshot(snapshot){if(pending||failed)throw new Error('Há alterações locais não sincronizadas. Exporte o backup e recarregue.');revision=snapshot.revision;onStatus('Salvo no Neon');},
    async load(){const result=await request('GET');revision=result.revision;onStatus('Neon conectado');return result.state;},
    save(state){
      if(failed) return Promise.reject(new Error('Sincronização interrompida. Exporte o backup local e recarregue.'));
      const snapshot=structuredClone(state);pending++;onStatus('Salvando no Neon…');
      tail=tail.then(async()=>{if(failed)throw new Error('Sincronização interrompida.');const result=await request('PUT',{state:snapshot,revision});revision=result.revision;}).catch(err=>{failed=true;onStatus('Falha na sincronização — exporte um backup e recarregue');throw err;}).finally(()=>{pending--;if(!failed&&!pending)onStatus('Salvo no Neon');});
      return tail;
    },
    async flush(){await tail;if(failed)throw new Error('Sincronização interrompida.');return revision;},
    get pending(){return pending;}
  };
}
