import {applyOperation} from './assistant-tools.mjs';
import {validateState} from './dist/domain.mjs';
const conflict=()=>Object.assign(new Error('A prévia expirou, foi cancelada ou os dados mudaram. Solicite uma nova prévia.'),{status:409});
export function createAssistantRepository(url,{client}={}){
  let defaultClient;
  async function db(){if(client)return client;if(!defaultClient){const {PrismaClient}=await import('@prisma/client');const {PrismaPg}=await import('@prisma/adapter-pg');defaultClient=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:3,connectionTimeoutMillis:10000})});}return defaultClient;}
  const workspace=userId=>'user:'+userId;
  async function readFrom(tx,userId){const row=await tx.financeState.findUnique({where:{workspaceId:workspace(userId)}});return row?{state:validateState(row.payload),revision:row.revision}:{state:null,revision:0};}
  return {
    async read(userId){return readFrom(await db(),userId);},
    async prepare(data,now=new Date()){
      const tx=await db();
      try{return await tx.assistantOperation.create({data});}catch(error){
        if(error.code!=='P2002')throw error;
        const old=await tx.assistantOperation.findUnique({where:{userId_requestId:{userId:data.userId,requestId:data.requestId}}});
        if(!old||old.inputHash!==data.inputHash||old.status!=='pending'||old.expiresAt<=now)throw conflict();return old;
      }
    },
    async confirm(userId,hash,now){
      return (await db()).$transaction(async tx=>{
        const op=await tx.assistantOperation.findFirst({where:{tokenHash:hash,userId}});
        if(!op)throw conflict();
        if(op.status==='confirmed')return {...op.result,...await readFrom(tx,userId),replayed:true};
        if(op.status!=='pending'||op.expiresAt<=now)throw conflict();
        const snapshot=await readFrom(tx,userId);if(snapshot.revision!==op.revision)throw conflict();
        const state=applyOperation(snapshot.state,op.operation);
        const consumed=await tx.assistantOperation.updateMany({where:{id:op.id,userId,status:'pending',expiresAt:{gt:now}},data:{status:'confirmed'}});
        if(consumed.count!==1)throw conflict();
        const saved=await tx.financeState.updateMany({where:{workspaceId:workspace(userId),revision:op.revision},data:{payload:state,revision:{increment:1},updatedAt:now}});
        if(saved.count!==1)throw conflict();
        const result={content:op.operation.intent==='delete_transaction'?'Lançamento cancelado e histórico preservado.':'Lançamento salvo com sucesso.',transactionId:op.operation.transaction.id};
        await tx.assistantOperation.update({where:{id:op.id},data:{result}});
        return {...result,state,revision:op.revision+1,replayed:false};
      });
    },
    async cancel(userId,hash){await (await db()).assistantOperation.updateMany({where:{userId,tokenHash:hash,status:'pending'},data:{status:'cancelled'}});}
  };
}
