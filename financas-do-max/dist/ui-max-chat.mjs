import {localMaxReply} from './max-financial-context.mjs';
import {monthName,uid} from './domain.mjs';
import {createAssistantActions} from './ui-assistant-actions.mjs';

export function createMaxChat({getState,getMonth,setMonth,commit,remote,onSaved,render,e,icon,$,fetcher=fetch}){
  const actions=createAssistantActions({getState,getMonth,commit,remote,onSaved,render,e,$,fetcher});
  let configured=false,mode='local',busy=false,error='',draft='';
  function scroll(){queueMicrotask(()=>{const list=$('#chat-messages');if(list)list.scrollTop=list.scrollHeight;});}
  return {
    get configured(){return configured;},
    async init(){try{const res=await fetcher('/api/chat/status',{signal:AbortSignal.timeout(5000)});if(res.ok)configured=(await res.json()).configured===true;}catch{/* Local queries remain available. */}},
    render(){
      const state=getState(),month=getMonth();
      const suggestions=mode==='gemini'?['Me ajude a organizar este mês','Onde posso reduzir meus gastos?','Como posso chegar à minha meta?','Compare meu consumo com o mês passado']:['Quanto gastei este mês?','Compare com o mês passado','Quais são minhas assinaturas?','Há cobranças duplicadas?'];
      return `${mode==='agent'?actions.render():''}<div class="chat-page"><button type="button" class="btn" id="max-agent">${mode==='agent'?'Agente financeiro ativo · Gemini com fallback local':'Registrar ou gerenciar por mensagem'}</button><p class="hint">No agente financeiro, toda alteração exige prévia e confirmação. Para voltar às consultas, escolha um modo abaixo.</p><div class="chat-top"><span>${icon('spark')} Assistente Max</span><span class="badge soft">${mode==='agent'?'AGENTE FINANCEIRO':mode==='gemini'?'GEMINI':'CONSULTAS LOCAIS'}</span></div>
        <div class="max-controls"><label>Como conversar<select id="max-mode" ${busy?'disabled':''}><option value="agent" ${mode==='agent'?'selected':''}>Agente financeiro · registrar com confirmação</option><option value="local" ${mode==='local'?'selected':''}>Consultas locais</option><option value="gemini" ${mode==='gemini'?'selected':''} ${configured?'':'disabled'}>Conversar com Gemini${configured?'':' · indisponível'}</option></select></label><label>Período da análise<input id="max-month" type="month" value="${e(month)}" required ${busy?'disabled':''}></label></div>
        <p class="max-privacy">${mode==='agent'?'Somente o comando digitado e a data de referência são enviados ao Gemini para interpretação. Você revisa e confirma qualquer alteração.':mode==='gemini'?'Ao enviar, sua pergunta, as últimas mensagens e um resumo financeiro serão enviados ao Google Gemini. Confira os valores antes de decidir.':'Consultas calculadas com seus registros. Nenhum dado é enviado a um provedor de IA.'}</p>
        <div class="chat-messages" id="chat-messages" role="log" aria-label="Conversa com o Max" aria-live="polite" aria-relevant="additions text">${!state.messages.length?`<div class="chat-welcome"><div class="welcome-mark"><span class="theme-logo" style="width:58px;height:58px">${icon('spark',34)}</span></div><div class="eyebrow">UM POUCO MAIS DE CLAREZA</div><h1>Olá, ${e(state.profile.name)}.<br><span>Vamos falar de dinheiro?</span></h1><p>Suas contas, seus hábitos e seus próximos passos.<br>Pergunte sobre os dados que você registrou aqui.</p></div>`:state.messages.slice(-50).map(m=>`<div class="message ${m.role==='assistant'?'assistant':'user'}">${m.role==='assistant'?'<span class="mini-mark">m.</span>':''}<div>${m.role==='assistant'?`<small class="max-message-source">${m.source==='gemini'?'Max · Gemini':'Max · cálculo local'}${m.month?' · '+e(monthName(m.month)):''}</small>`:''}<span>${e(m.content).replaceAll('\n','<br>')}</span>${m.notice?`<small class="max-answer-notice">${e(m.notice)}</small>`:''}</div></div>`).join('')}${busy?'<div class="message assistant max-thinking" role="status"><span class="mini-mark">m.</span><div>Consultando seus registros…</div></div>':''}</div>
        <div class="chat-bottom">${error?`<p class="max-error" role="alert">${e(error)} Sua pergunta está abaixo para tentar novamente.</p>`:''}<div class="suggestions">${suggestions.map(q=>`<button class="suggestion" data-action="ask" data-question="${e(q)}" ${busy?'disabled':''}>${e(q)}</button>`).join('')}</div><form id="chat-form" class="chat-composer"><label class="sr-only" for="chat-input">Sua pergunta</label><textarea id="chat-input" name="message" placeholder="O que você quer entender sobre seu dinheiro?" rows="2" required maxlength="2000" ${busy?'disabled':''}>${e(draft)}</textarea><div><span>${icon('wallet',15)} ${e(monthName(month))}</span><button type="button" class="btn small" id="max-voice">Ditar</button><button class="send-btn" type="submit" aria-label="Enviar pergunta" ${busy?'disabled':''}>${icon('up',20)}</button></div></form><p class="chat-disclaimer">${mode==='agent'?'Alterações exigem prévia e confirmação. O comando é enviado ao Gemini quando disponível; o fallback interpreta no servidor.':configured?'Escolha consultas locais ou Gemini.':'Gemini ainda não está disponível. Suas consultas locais continuam funcionando.'} O ditado depende da compatibilidade e do serviço de voz do navegador.</p></div></div>`;
    },
    bind(){
      actions.bind();
      const Voice=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
      const voiceButton=$('#max-voice');
      if(voiceButton){voiceButton.disabled=!Voice||busy;voiceButton.title=Voice?'Ditar sem enviar automaticamente':'Ditado não disponível neste navegador';}
      voiceButton?.addEventListener('click',()=>{if(!Voice)return;const voice=new Voice();voice.lang='pt-BR';voice.onresult=event=>{draft=event.results[0][0].transcript.slice(0,2000);render();};voice.onerror=()=>{error='Não foi possível usar o microfone. Você pode continuar digitando.';render();};voice.start();});
      $('#max-agent')?.addEventListener('click',()=>{mode='agent';render();});
      $('#max-mode')?.addEventListener('change',event=>{draft=$('#chat-input')?.value||'';mode=event.target.value==='agent'?'agent':event.target.value==='gemini'&&configured?'gemini':'local';render();scroll();});
      $('#max-month')?.addEventListener('change',event=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))return;draft=$('#chat-input')?.value||'';setMonth(event.target.value);render();scroll();});
      $('#chat-input')?.addEventListener('input',event=>{draft=event.target.value;});
    },
    async send(text){
      if(busy||typeof text!=='string'||!text.trim())return;
      if(mode==='agent'){
        if(actions.blocked)return;
        const message=text.trim().slice(0,2000);draft='';
        commit(s=>{s.messages.push({id:uid(),role:'user',content:message,month:getMonth()});s.messages=s.messages.slice(-100);});
        await actions.send(message);return;
      }
      const message=text.trim().slice(0,2000),month=getMonth(),chosenMode=mode;
      busy=true;error='';draft='';
      try{
        commit(s=>{const last=s.messages.at(-1);if(last?.role!=='user'||last.content!==message)s.messages.push({id:uid(),role:'user',content:message,month});s.messages=s.messages.slice(-100);});scroll();
        let reply;
        if(chosenMode==='local')reply={content:localMaxReply(getState(),month,message),source:'local',month};
        else{
          const revision=await remote.flush();
          const res=await fetcher('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,month,revision}),signal:AbortSignal.timeout(28000)});
          reply=await res.json();
          if(!res.ok)throw new Error(reply.error||'Não foi possível consultar o Max.');
          if(typeof reply.content!=='string'||!reply.content.trim()||reply.content.length>9000)throw new Error('O Max não concluiu a resposta.');
        }
        commit(s=>{s.messages.push({id:uid(),role:'assistant',content:reply.content,source:reply.source==='gemini'?'gemini':'local',month,notice:reply.notice||null});s.messages=s.messages.slice(-100);});
      }catch(err){error=err.name==='TimeoutError'?'A consulta demorou mais que o esperado.':err.message;draft=message;}
      finally{busy=false;render();scroll();$('#chat-input')?.focus();}
    }
  };
}
