import {randomUUID} from 'node:crypto';
// SQL/client test double only. No credentials or external connections.
export function memoryPrisma(states){
  let rows=new Map(Object.entries(states).map(([id,state])=>['user:'+id,{workspaceId:'user:'+id,revision:1,payload:structuredClone(state)}])),ops=[],tail=Promise.resolve();
  const match=(row,where)=>Object.entries(where).every(([k,v])=>v&&typeof v==='object'&&'gt'in v?row[k]>v.gt:row[k]===v);
  const client={
    financeState:{async findUnique({where}){return structuredClone(rows.get(where.workspaceId)||null);},async updateMany({where,data}){const row=rows.get(where.workspaceId);if(!row||row.revision!==where.revision)return {count:0};Object.assign(row,{payload:structuredClone(data.payload),revision:row.revision+1});return {count:1};}},
    assistantOperation:{
      async create({data}){if(ops.some(o=>o.userId===data.userId&&o.requestId===data.requestId))throw Object.assign(new Error('unique'),{code:'P2002'});const row={...structuredClone(data),id:randomUUID(),status:'pending'};ops.push(row);return structuredClone(row);},
      async findUnique({where}){return structuredClone(ops.find(o=>match(o,where.userId_requestId))||null);},
      async findFirst({where}){return structuredClone(ops.find(o=>match(o,where))||null);},
      async updateMany({where,data}){const hits=ops.filter(o=>match(o,where));for(const o of hits)Object.assign(o,structuredClone(data));return {count:hits.length};},
      async update({where,data}){Object.assign(ops.find(o=>o.id===where.id),structuredClone(data));}
    },
    async $transaction(fn){const run=tail.then(async()=>{const priorRows=structuredClone(rows),priorOps=structuredClone(ops);try{return await fn(client);}catch(error){rows=priorRows;ops=priorOps;throw error;}});tail=run.catch(()=>{});return run;}
  };
  return client;
}
