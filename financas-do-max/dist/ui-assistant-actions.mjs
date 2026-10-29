import {currency,localDate,moneyInput} from './domain.mjs';
export function createAssistantActions({getState,getMonth,remote,onSaved,commit,render,e,$,fetcher=fetch}){
  let pending=null,editable=null,busy=false,content='',error='',requestId=null,lastMessage='',savedTransactionId='',lastRevision=null;
  const post=async(path,body)=>{const res=await fetcher('/api/assistant/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(28000)});const data=await res.json();if(!res.ok)throw new Error(data.error||'Não foi possível concluir.');return data;};
  async function send(message,editedIntent){
    if(busy)return;busy=true;error='';content='';savedTransactionId='';render();
    try{
      const revision=await remote.flush();
      if(message!==lastMessage||editedIntent||revision!==lastRevision){requestId=crypto.randomUUID();lastMessage=message;}requestId??=crypto.randomUUID();lastRevision=revision;
      const data=await post('chat',{message,month:getMonth(),revision,requestId,...(editedIntent?{editedIntent}:{})});
      pending=data.pending||null;editable=data.editableIntent||null;content=data.content;
      if(!pending&&!data.clarification){editable=null;commit(s=>{s.messages.push({id:crypto.randomUUID(),role:'assistant',content,source:data.source||'local',month:getMonth()});});content='';}
    }catch(err){error=err.name==='TimeoutError'?'A conexão demorou. Tente novamente; nenhuma confirmação foi enviada.':err.message;}
    finally{busy=false;render();}
  }
  return {send,
    render(){
      const p=pending?.preview,s=getState();
      let editAmount='';try{if(editable?.amount)editAmount=(moneyInput(editable.amount.replace(/\s*mil\b/i,''))*(/mil\b/i.test(editable.amount)?1000:1)/100).toFixed(2).replace('.',',');}catch{/* Ask for a valid value. */}
      const options=(rows,current)=>'<option value="">Selecione…</option>'+rows.map(x=>`<option value="${e(x.name)}" ${x.name===current?'selected':''}>${e(x.name)}</option>`).join('');
      return `<section class="assistant-operation" aria-live="polite">${busy?'<p role="status">Processando…</p>':''}${error?`<p role="alert">${e(error)}</p>`:''}${content?`<p>${e(content)}</p>`:''}${savedTransactionId?`<button type="button" class="btn" data-action="transaction" data-id="${e(savedTransactionId)}">Ver lançamento</button>`:''}${p?`<h3>${p.action==='delete_transaction'?'Cancelar lançamento':p.action==='update_transaction'?'Alterar lançamento':'Novo lançamento'}</h3><dl><dt>Descrição</dt><dd>${e(p.description)}</dd><dt>Valor total</dt><dd>${e(currency(p.amount))}</dd><dt>Tipo</dt><dd>${p.type==='income'?'Receita':'Despesa'}</dd><dt>Conta</dt><dd>${e(p.account)}</dd><dt>Categoria</dt><dd>${e(p.category)}</dd><dt>Data</dt><dd>${e(p.date)}</dd>${p.card?`<dt>Cartão / parcelas</dt><dd>${e(p.card)} · ${p.installments}x</dd>`:''}</dl><p>Prévia válida até ${e(new Date(pending.expiresAt).toLocaleTimeString('pt-BR'))}. Nenhum lançamento salvo ainda.</p><div class="assistant-buttons"><button type="button" class="btn primary" id="assistant-confirm" ${busy?'disabled':''}>Confirmar</button><button type="button" class="btn" id="assistant-edit" ${busy?'disabled':''}>Editar</button><button type="button" class="btn" id="assistant-cancel" ${busy?'disabled':''}>Cancelar</button></div>`:''}${editable&&!p?`<form id="assistant-edit-form"><p>Complete os dados e gere uma nova prévia.</p>${editable.intent!=='delete_transaction'?`<label>Valor em reais<input name="amount" data-mask="currency" inputmode="decimal" required value="${e(editAmount)}"></label>`:''}${editable.intent!=='create_transaction'?`<label>Descrição do lançamento a localizar<input name="target" required maxlength="240" value="${e(editable.target||'')}"></label>`:''}${editable.intent==='create_transaction'?`<label>Descrição<input name="description" maxlength="240" required value="${e(editable.description||lastMessage)}"></label><label>Tipo<select name="type"><option value="expense" ${editable.type==='expense'?'selected':''}>Despesa</option><option value="income" ${editable.type==='income'?'selected':''}>Receita</option></select></label><label>Conta<select name="accountName" required>${options(s.accounts,editable.accountName)}</select></label><label>Categoria<select name="categoryName" required>${options(s.categories,editable.categoryName)}</select></label><label>Cartão (opcional)<select name="cardName">${options(s.cards,editable.cardName)}</select></label><label>Data<input name="date" type="date" required value="${e(/^\d{4}-\d{2}-\d{2}$/.test(editable.date||'')?editable.date:localDate())}"></label><label>Parcelas<input name="installments" type="number" min="1" max="600" value="${editable.installments||1}" required></label>`:''}<button class="btn primary" ${busy?'disabled':''}>Gerar prévia</button></form>`:''}</section>`;
    },
    bind(){
      $('#assistant-confirm')?.addEventListener('click',async()=>{
        if(busy||!pending)return;busy=true;error='';render();
        try{await remote.flush();const result=await post('confirm',{token:pending.token});await onSaved(result);pending=null;editable=null;content=result.content;savedTransactionId=result.transactionId;commit(s=>{s.messages.push({id:crypto.randomUUID(),role:'assistant',content:result.content,source:'local',month:getMonth()});s.messages=s.messages.slice(-100);});requestId=null;}
        catch(err){error=err.message+' Se a conexão caiu após confirmar, tente Confirmar novamente para consultar o resultado sem duplicar.';}
        finally{busy=false;render();}
      });
      $('#assistant-cancel')?.addEventListener('click',async()=>{if(busy)return;busy=true;try{await post('cancel',{token:pending.token});pending=null;editable=null;content='Operação cancelada.';}catch(err){error=err.message;}finally{busy=false;render();}});
      $('#assistant-edit')?.addEventListener('click',async()=>{if(busy)return;busy=true;try{await post('cancel',{token:pending.token});const p=pending.preview;editable={...editable,amount:(p.amount/100).toFixed(2),date:p.date,accountName:p.account,categoryName:p.category,cardName:p.card,description:p.description,installments:p.installments};pending=null;}catch(err){error=err.message;}finally{busy=false;render();}});
      $('#assistant-edit-form')?.addEventListener('submit',event=>{event.preventDefault();const form=new FormData(event.target),intent={...editable};for(const [k,v]of form)intent[k]=k==='installments'?Number(v):v||null;send(lastMessage,intent);});
    },
    get blocked(){return busy||Boolean(pending);}
  };
}
