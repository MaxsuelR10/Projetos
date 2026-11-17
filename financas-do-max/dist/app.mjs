import {institutionIdentity, institutionOptionLabel} from './institutions.mjs';
import {createInstitutionUI} from './ui-institutions.mjs';
import {summaryFor, sortSelectOptions, uncategorizedOption} from './summary.mjs';
import {STORE_KEY as BASE_STORE_KEY,currency,uid,localDate,monthName,shiftMonth,moneyInput,normalize,monthlyRows,totals,categoryTotals,dailyTotals,cumulative,accountBalance,installmentSummary,evaluateAgents,assistantReply,parseCSV,csvExport,validateState,seedState,financialReport,pendingExpenses} from './domain.mjs';
import {invoiceFor, cardCommitment, creditInstallmentPlans, cycleConfigured, assertPurchaseAllowed, assertPurchaseEditable, hasPaidPurchase, registerInvoicePayment, editInvoicePayment, cancelInvoicePayment} from './billing.mjs';
import {previewCsvImport, csvSelectionSummary, buildCsvImport, applyCsvType, canCorrectCsvType, planCsvTypeCorrection, csvCardCorrectionCandidates, planCsvCardCorrection} from './csv-import.mjs';
import {appendAudit} from './audit.mjs';
import {createRecurrenceUI} from './ui-recurrences.mjs';
import {createSubscriptionCalendarUI} from './ui-subscription-calendar.mjs';
import {createFinancialOperationsUI} from './ui-financial-operations.mjs';
import {applyInputMasks} from './input-masks.mjs';
import {applyPalette, paletteOptions} from './appearance.mjs';
import {createMaxChat} from './ui-max-chat.mjs';
import {createNotificationUI} from './ui-notifications.mjs';

import {createRemoteStorage} from './remote-storage.mjs';
import {requireSession} from './auth-ui.mjs';
const session=await requireSession();
const sessionFetch=(path, options={})=>{
  const headers=new Headers(options.headers);
  headers.set('X-Financas-User',session.id);
  return fetch(path,{...options,headers});
};
document.addEventListener('click',async event=>{
  if(!event.target.closest('[data-action="logout"]'))return;
  if(remote.pending){toast('Aguarde o término da sincronização antes de sair.');return;}
  try{await notifications.disable({logout:true});const res=await sessionFetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!res.ok)throw new Error('Não foi possível sair.');location.reload();}catch(err){toast(err.message);}
});
const STORE_KEY=BASE_STORE_KEY+':user:'+session.id;
function initialState(){const s=seedState();for(const key of ['transactions','cards','installments','subscriptions','investments','messages','agents','recurrences','audit'])if(Array.isArray(s[key]))s[key]=[];s.accounts=[{id:'wallet',name:'Minha carteira',type:'Dinheiro',color:'#72dbb0',openingBalance:0}];s.profile.name=session.name||'Meu espaço';return s;}
let remoteStatus='Conectando ao Neon…',remoteReady=false;
let savingConfirmedChange=false;
const remote=createRemoteStorage({fetcher:sessionFetch,onStatus:message=>{remoteStatus=message;const el=document.querySelector('#sync-status');if(el)el.textContent=message;}});
const $=s=>document.querySelector(s);
function mountThemeControls(){
  const palette=$('#profile-form [name="palette"]');if(!palette)return;
  const profile=state.profile,surface=profile.surface||'dark',color=profile.customColor||'#79e6b4';
  const wrapper=document.createElement('div');wrapper.className='theme-options';
  wrapper.innerHTML=`<fieldset class="theme-base"><legend>Aparência</legend><label><input type="radio" name="surface" value="dark" ${surface==='dark'?'checked':''}><span class="base-swatch dark"></span>Escuro</label><label><input type="radio" name="surface" value="light" ${surface==='light'?'checked':''}><span class="base-swatch light"></span>Claro suave</label></fieldset><div class="custom-color-field" ${profile.palette==='custom'?'':'hidden'}><label for="custom-color">Sua cor</label><div><input id="custom-color" name="customColor" type="color" value="${color}" aria-label="Escolher cor personalizada"><input id="custom-color-hex" aria-label="Código hexadecimal da cor" type="text" value="${color}" maxlength="7" pattern="#[0-9a-fA-F]{6}" spellcheck="false"></div><small>Escolha no seletor ou digite um código como #D65A9B.</small></div>`;
  palette.closest('.field')?.insertAdjacentElement('beforebegin',wrapper);
  const preview=()=>{applyPalette(palette.value,wrapper.querySelector('[name="surface"]:checked').value,wrapper.querySelector('#custom-color').value);wrapper.querySelector('.custom-color-field').hidden=palette.value!=='custom';};
  palette.addEventListener('change',preview);
  wrapper.addEventListener('input',event=>{
    const picker=wrapper.querySelector('#custom-color'),hex=wrapper.querySelector('#custom-color-hex');
    if(event.target===hex){if(!/^#[0-9a-f]{6}$/i.test(hex.value)){hex.setCustomValidity('Use # seguido de 6 caracteres de 0 a 9 ou A a F.');return;}hex.setCustomValidity('');picker.value=hex.value;}
    if(event.target===picker){hex.value=picker.value.toUpperCase();hex.setCustomValidity('');}
    preview();
  });
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e=escape;
const iconPaths={chart:'M4 19V5m0 14h16M8 15l4-5 4 2 4-7',chat:'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',bot:'M8 3h8l2 4h2v13H4V7h2l2-4ZM8 12h.01M16 12h.01M9 16h6',card:'M3 7h18v13H3V7Zm0 4h18M7 16h3',wallet:'M4 5h15v3H4V5Zm0 3h17v12H4V8Zm11 5h6',chevron:'m9 5 7 7-7 7',down:'m6 9 6 6 6-6',plus:'M12 5v14M5 12h14',close:'m6 6 12 12M6 18 18 6',search:'M21 21l-5-5m2-6a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',arrow:'M7 17 17 7M7 7h10v10',up:'m6 14 6-6 6 6',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',upload:'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z',repeat:'M4 8h15l-3-3M20 16H5l3 3M20 8v3M4 16v-3',tag:'M3 3h8l10 10-8 8L3 11V3Zm4 4h.01',calendar:'M4 5h16v16H4V5Zm0 5h16M8 3v4m8-4v4',grid:'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7',menu:'M4 6h16M4 12h16M4 18h16',check:'m5 12 4 4L19 6',bell:'M6 9a6 6 0 0 1 12 0v7l2 2H4l2-2V9Zm4 12h4',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',edit:'m4 16-1 5 5-1L21 7l-6-6L4 16ZM13 3l6 6',pie:'M12 3v9h9a9 9 0 1 1-9-9Zm4 0v5h5'};
const icon=(name,size=18)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name]||iconPaths.grid}"/></svg>`;
const institutionUI = createInstitutionUI({icon, escape});
let corruptedBackup=null;
let state;
try{const raw=localStorage.getItem(STORE_KEY);try{state=raw?validateState(JSON.parse(raw)):initialState();}catch{corruptedBackup=raw;state=initialState();}}catch{state=initialState();}
try{
  const cloud=await remote.load();
  if(cloud){const prior=localStorage.getItem(STORE_KEY);if(prior&&prior!==JSON.stringify(cloud))localStorage.setItem(STORE_KEY+':before-neon',prior);state=validateState(cloud);localStorage.setItem(STORE_KEY,JSON.stringify(state));}
  else if(!corruptedBackup){await remote.save(state);localStorage.setItem(STORE_KEY,JSON.stringify(state));}
  else throw new Error('Recupere o backup local antes de inicializar o Neon.');
  remoteReady=true;
}catch{remoteStatus='Neon indisponível — alterações bloqueadas; exporte seu backup';}
function persistState(next){
  if(!navigator.onLine)throw new Error('Sem conexão. Reconecte antes de salvar.');
  if(!remoteReady)throw new Error('Neon indisponível. Recarregue a página antes de alterar os dados.');
  localStorage.setItem(STORE_KEY,JSON.stringify(next));
  return remote.save(next);
}
window.addEventListener('beforeunload',event=>{if(remote.pending){event.preventDefault();event.returnValue='';}});
window.addEventListener('financas-before-update',event=>{
  if(remote.pending||remote.failed||document.querySelector('#modal-root .modal'))event.preventDefault();
});
let month=localDate().slice(0,7),account='',page=1,filters={search:'',category:'',kind:'',hidden:false,sort:'newest',day:''},menuOpen=false,modalBack=null,alerts=[];
let reportBasis='consumption',overviewCardId='',summaryAccount='',summaryCategory='';
const sections=[['overview','Resumo','chart'],['transactions','Transações','repeat'],['installments','Parcelamentos','card'],['subscriptions','Assinaturas','calendar'],['recurrences','Recorrências','repeat'],['categories','Categorias','tag'],['cards','Cartões','wallet']];
const routes=new Set([...sections.map(s=>s[0]),'chat','investments','settings','accounts','activity','notifications']);
const section=()=>{const s=location.hash.replace(/^#\/?/,'').split('?')[0];return routes.has(s)?s:'overview';};
const cat=id=>state.categories.find(c=>c.id===id)||{name:'Sem categoria',icon:'◌',budget:0};
const acct=id=>state.accounts.find(a=>a.id===id)||{name:'Conta',color:'#6f8d82'};
const badge=(text,cls='')=>`<span class="badge ${cls}">${e(text==='Dados de exemplo'&&!state.transactions.some(t=>t.source==='demo')?'Dados locais':text)}</span>`;
const button=(label,action,ico='',cls='btn',data='')=>`<button class="${cls}" data-action="${action}" ${data}>${ico?icon(ico):''}${e(label)}</button>`;
const selected=(v,match)=>v===match?'selected':'';
const options=(list,value,key='name')=>[...list].sort((a,b)=>String(a[key]).localeCompare(String(b[key]),'pt-BR',{sensitivity:'base',numeric:true})).map(x=>`<option value="${e(x.id)}" ${selected(x.id,value)}>${e(key==='name'&&typeof x.name==='string'?institutionOptionLabel(x):x[key])}</option>`).join('');
const empty=(title,desc,action='transaction',label='Adicionar transação')=>`<div class="empty">${icon('wallet',32)}<h3>${e(title)}</h3><p>${e(desc)}</p>${action?button(label,action,'plus','btn primary'):''}</div>`;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function commit(update,message){
  if(savingConfirmedChange)throw new Error('Aguarde a confirmação da alteração.');
  const next=structuredClone(state);
  update(next);
  appendAudit(state,next,{action:message||'Dados financeiros atualizados'});
  validateState(next);
  const saved=persistState(next);
  state=next;render();
  saved.then(()=>{if(message)toast(message);},err=>{remoteReady=false;toast(err.message);});
}
async function commitConfirmed(update,message){
  if(!navigator.onLine)throw new Error('Sem conexão. Reconecte antes de salvar.');
  if(savingConfirmedChange||!remoteReady)throw new Error('Aguarde a sincronização ou recarregue a página antes de salvar.');
  const next=structuredClone(state);
  update(next);
  appendAudit(state,next,{action:message});
  validateState(next);
  savingConfirmedChange=true;
  try{
    await remote.save(next);
  }catch(error){
    remoteReady=false;
    throw error;
  }finally{
    savingConfirmedChange=false;
  }
  state=next;
  try{localStorage.setItem(STORE_KEY,JSON.stringify(next));}catch{/* The confirmed copy is already stored remotely. */}
  closeModal();
  render();
  toast(message);
}
function go(route){menuOpen=false;if(section()===route)render();else location.hash='/'+route;}
function goCategory(id){filters.category=id||uncategorizedOption(state).id;filters.search='';filters.day='';filters.cardId=section()==='overview'?overviewCardId:filters.cardId||'';filters.basis=section()==='overview'?(overviewCardId?'consumption':reportBasis):filters.basis||'consumption';page=1;go('transactions');}
const moneyFields=new Set(['amount','budget','limit','openingBalance','monthlyGoal','monthlyBudget','salary']);
const integerFields=new Set(['installmentCount','count','paid','closingDay','dueDay','interval','occurrencesLimit']);
function field(label,name,value='',type='text',extra=''){
  const mask=moneyFields.has(name)?' data-mask="currency" inputmode="decimal" autocomplete="off"':integerFields.has(name)?' data-mask="integer" inputmode="numeric"':type==='date'?' inputmode="numeric"': '';
  if(name==='closingDay'||name==='dueDay')type='text';
  return `<label class="field"><span>${e(label)}</span><input name="${name}" type="${type}" value="${e(value)}"${mask} ${extra}></label>`;
}
function selectField(label,name,opts,extra=''){return `<label class="field"><span>${e(label)}</span><select name="${name}" ${extra}>${opts}</select></label>`;}
function openModal(title,body,{wide=false,footer='',onSubmit=null}={}){
  modalBack=document.activeElement;document.body.classList.add('modal-is-open');
  $('#modal-root').innerHTML=`<div class="backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><span class="eyebrow">FINANÇAS DO MAX</span><h2 id="modal-title">${e(title)}</h2></div><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fechar">${icon('close')}</button></header><div class="modal-body">${body}</div>${footer}</section></div>`;
  applyInputMasks($('#modal-root'));sortSelectOptions($('#modal-root'));institutionUI.bind($('#modal-root'));
  const form=$('#modal-root form');if(form&&onSubmit)form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    const submit=form.querySelector('[type=submit]');
    if(submit?.disabled)return;
    if(submit)submit.disabled=true;
    try{await onSubmit(new FormData(form));}catch(err){let error=form.querySelector('.form-error');if(!error){error=document.createElement('p');error.className='form-error';error.setAttribute('role','alert');form.prepend(error);}error.textContent=err.message;}
    finally{if(submit)submit.disabled=false;}
  });
  queueMicrotask(()=>$('#modal-root input, #modal-root textarea, #modal-root select, #modal-root button')?.focus());
}
function closeModal(){const back=modalBack;$('#modal-root').innerHTML='';document.body.classList.remove('modal-is-open');if(back?.isConnected)back.focus({preventScroll:true});else $('#main')?.focus({preventScroll:true});}
function formFooter(label='Salvar'){return `<div class="form-footer">${button('Cancelar','close-modal','','btn','type="button"')}<button class="btn primary" type="submit">${icon('check')}${e(label)}</button></div>`;}
function shell(content){const s=section();const title=sections.find(x=>x[0]===s)?.[1]||({chat:'Seu assistente',investments:'Investimentos',notifications:'Avisos',settings:'Configurações',accounts:'Contas',activity:'Histórico'}[s]);
return `<a class="skip-link" href="#main">Ir para o conteúdo</a>${menuOpen?'<button class="sidebar-scrim" data-action="close-menu" aria-label="Fechar menu lateral"></button>':''}<aside id="sidebar" class="sidebar ${menuOpen?'mobile-open':''}"><a class="brand" href="#/overview"><span class="theme-logo" style="width:36px;height:36px" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 32V17l9 12 8-12v15M34 30l5-13"/></svg></span><div>finanças<span>do max<span class="brand-dot">.</span></span></div></a><div class="workspace-label">SEU ESPAÇO FINANCEIRO</div><nav aria-label="Menu principal"><a href="#/chat" class="nav-link ${s==='chat'?'active':''}">${icon('chat')}<span>Fale com o Max</span><span class="tiny">MAX</span></a><a href="#/overview" class="nav-link ${s==='overview'?'active':''}">${icon('chart')}<span>Resumo</span></a>${sections.filter(([route])=>!['overview','cards','categories'].includes(route)).map(([route,label,ico])=>`<a href="#/${route}" class="nav-link ${s===route?'active':''}">${icon(ico)}<span>${label}</span></a>`).join('')}<a href="#/cards" class="nav-link">${icon('card')}<span>Cartões</span></a><a href="#/investments" class="nav-link ${s==='investments'?'active':''}">${icon('pie')}<span>Investimentos</span></a><a href="#/accounts" class="nav-link ${s==='accounts'?'active':''}">${icon('wallet')}<span>Minhas contas</span></a></nav><div class="sidebar-divider"></div><div class="workspace-label">ACESSO RÁPIDO</div><button class="nav-link" data-action="transaction">${icon('plus')}<span>Nova transação</span></button><a href="#/categories" class="nav-link">${icon('tag')}<span>Categorias</span></a><button class="nav-link" data-action="category">${icon('plus')}<span>Nova categoria</span></button><button class="nav-link" data-action="import">${icon('upload')}<span>Importar extrato</span></button><a href="#/settings" class="nav-link ${s==='settings'?'active':''}">${icon('settings')}<span>Configurações</span></a><div class="sidebar-note"><span class="status-dot"></span><strong>Seu dinheiro, do seu jeito.</strong><p>Dados sincronizados com o Neon.<br>Cópia de segurança neste navegador.</p></div><a href="#/settings" class="profile"><span class="avatar">${e(state.profile.name.slice(0,1).toUpperCase())}</span><div><strong>${e(state.profile.name)}</strong><small>Espaço pessoal</small></div>${icon('settings',17)}</a></aside><div class="app-main"><header class="topbar"><div class="breadcrumb"><button class="icon-btn mobile-menu" aria-label="${menuOpen?'Fechar menu':'Abrir menu'}" aria-controls="sidebar" aria-expanded="${menuOpen}" data-action="menu">${icon('menu')}</button><span>Meu espaço</span>${icon('chevron',13)}<strong>${e(title)}</strong></div><div class="top-actions">${badge('Dados de exemplo','demo-badge')}${button('Contas','accounts','wallet','account-pill')}<button class="icon-btn notification-btn" aria-label="Ver alertas" data-action="alerts">${icon('bell')}${notifications.count()?'<i></i>':''}</button></div></header><main id="main" tabindex="-1">${sections.some(x=>x[0]===s)?`<div class="tabs" role="navigation" aria-label="Painel financeiro">${sections.map(([id,label,ico])=>`<a href="#/${id}" class="tab ${s===id?'selected':''}" ${s===id?'aria-current="page"':''}>${icon(ico,16)}${label}</a>`).join('')}</div>`:''}${corruptedBackup?'<div class="notice warning">Não foi possível ler o armazenamento anterior. Você pode recuperá-lo em Configurações antes de salvar novos dados.</div>':''}${content}</main><footer class="app-footer"><span>Feito para ter clareza. Construído para ser seu.</span><span><i class="status-dot"></i> <span id="sync-status">${e(remoteStatus)}</span></span><button class="btn" data-action="logout">Sair da conta</button></footer><nav class="mobile-bottom-nav" aria-label="Navegação rápida">${[['overview','Resumo','chart'],['transactions','Transações','repeat'],['cards','Cartões','card'],['accounts','Contas','wallet']].map(([route,label,ico])=>`<a href="#/${route}" ${s===route?'aria-current="page"':''}>${icon(ico,20)}<span>${label}</span></a>`).join('')}</nav></div>`;
}
function periodControl(){return `<div class="period-control"><button class="icon-btn" data-action="prev-month" aria-label="Mês anterior">${icon('chevron')}</button><label><span class="sr-only">Mês de referência</span><input type="month" id="month-filter" value="${month}" aria-label="Mês de referência"></label><button class="icon-btn" data-action="next-month" aria-label="Próximo mês">${icon('chevron')}</button></div>`;}
function pageHeader(title,subtitle,actions=''){return `<div class="page-heading"><div><div class="eyebrow">${e(monthName(month))}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;}
function cardHeading(title,link='',action=''){return `<div class="card-heading"><h3>${e(title)}</h3>${link?`<button class="text-link" data-action="${action}">${e(link)} ${icon('arrow',13)}</button>`:''}</div>`;}
function statCard(label,value,ico,sub='',cls=''){return `<div class="panel stat-card ${cls}"><div class="stat-label">${e(label)}${icon(ico)}</div><strong>${value}</strong><small>${sub}</small></div>`;}
function chart(rows,previous){const values=cumulative(dailyTotals(rows,month)),prev=cumulative(dailyTotals(previous,shiftMonth(month,-1)));const max=Math.max(...values,...prev,100);const path=arr=>arr.map((v,i)=>`${i?'L':'M'}${42+i*448/Math.max(arr.length-1,1)},${174-v/max*145}`).join(' ');const current=path(values),prior=path(prev);return `<div class="spending-chart" role="img" aria-label="Gastos acumulados por dia: mês atual ${e(currency(values.at(-1)))} e anterior ${e(currency(prev.at(-1)))}"><svg viewBox="0 0 510 204">${[0,.5,1].map(f=>`<line x1="42" x2="490" y1="${174-f*145}" y2="${174-f*145}" stroke="#252d29" stroke-dasharray="3 5"/><text x="2" y="${178-f*145}" fill="#7d8b85" font-size="10">${currency(Math.round(max*f)).replace(',00','')}</text>`).join('')}<defs><linearGradient id="fillChart" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#58dca7" stop-opacity=".13"/><stop offset="1" stop-color="#58dca7" stop-opacity="0"/></linearGradient></defs><path d="${current} L490,174 L42,174Z" fill="url(#fillChart)"/><path d="${prior}" fill="none" stroke="#68766e" stroke-width="1.5" stroke-dasharray="5 5"/><path d="${current}" fill="none" stroke="#6fe0b2" stroke-width="2.5"/><text x="42" y="198" fill="#7d8b85" font-size="10">01</text><text x="255" y="198" fill="#7d8b85" font-size="10">15</text><text x="478" y="198" fill="#7d8b85" font-size="10">${values.length}</text></svg></div><div class="chart-legend"><span><i></i>Este mês</span><span><i></i>Mês passado</span></div>`;}
function transactionList(rows,limit=5){return rows.slice(0,limit).map(t=>`<button class="transaction-item" data-action="transaction" data-id="${e(t.id)}"><span class="category-icon">${e(cat(t.categoryId).icon)}</span><span class="transaction-info"><strong>${e(t.description)}</strong><small>${e(cat(t.categoryId).name)} <span>· ${dateLabel(t.effectiveDate||t.date)}</span></small></span><span class="amount ${t.type==='income'?'positive':''}">${t.type==='income'?'+':t.type==='expense'?'−':''}${currency(t.amount)}</span></button>`).join('')||empty('Tudo começa com um registro','Adicione sua primeira transação.');}
function dateLabel(date){return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','');}
function renderOverview() {
  const report=summaryFor(state,month,{accountId:summaryAccount,cardId:overviewCardId});
  const category=report.categories.some(c=>c.id===summaryCategory)?summaryCategory:'';
  const cats=category?report.categories.filter(c=>c.id===category):report.categories;
  const scope=overviewCardId?state.cards.find(c=>c.id===overviewCardId)?.name:summaryAccount?acct(summaryAccount).name:'Todas as contas e cartões';
  const max=Math.max(...cats.map(c=>c.total),1);
  return `${pageHeader('Resumo','Seu saldo, suas entradas e seus gastos em um só lugar.',periodControl()+button('Nova transação','transaction','plus','btn primary'))}
    <section class="panel summary-filters" aria-label="Filtros do resumo">
      ${selectField('Conta','summary-account','<option value="">Todas as contas</option>'+options(state.accounts,summaryAccount),'id="summary-account"')}
      ${selectField('Cartão','overview-card','<option value="">Todos os cartões</option>'+options(state.cards.filter(c=>!summaryAccount||c.accountId===summaryAccount),overviewCardId),'id="overview-card"')}
      ${button('Limpar filtros','clear-summary','','btn')}
    </section><p class="summary-scope">${e(scope)} · ${e(monthName(month))}</p>
    <details class="summary-help"><summary>Como os valores são calculados?</summary><p class="hint">O total das faturas soma os cartões selecionados pelo mês do vencimento. Os gastos por categoria incluem as parcelas dessas faturas e as despesas da conta${report.throughDate?` lançadas até ${dateLabel(report.throughDate)}`:''}. Pagar uma fatura reduz o valor a pagar. O saldo mostra o valor atual das contas selecionadas.</p></details>
    <div class="stats-row four summary-stats">
      ${statCard('Saldo disponível',currency(report.balance),'wallet',overviewCardId?'Saldo atual da conta vinculada ao cartão':'Saldo atual das contas selecionadas')}
      ${statCard('Entrou no mês',currency(report.income),'arrow',overviewCardId?'Recebido na conta vinculada ao cartão':'Valores já recebidos no mês','income-card')}
      ${statCard('A pagar no mês',currency(report.payable),'calendar',overviewCardId?'Saldo das faturas do cartão selecionado':'Contas pendentes + saldos das faturas')}
      ${statCard('Gastos do mês',currency(report.spending),'card',overviewCardId?'Parcelas do cartão neste mês':'Despesas da conta + parcelas dos cartões')}
    </div>
    ${renderPendingInvoices('Faturas a pagar no mês',report.invoices,report.invoiceTotal)}
    ${renderPendingInvoices('Faturas atrasadas de meses anteriores',report.overdueInvoices,report.overdueInvoiceTotal)}
    <section class="panel summary-categories">
      ${cardHeading('Gastos por categoria')}
      ${selectField('Categoria do gráfico','summary-category','<option value="">Todas as categorias</option>'+options(report.categories,category),'id="summary-category"')}
      <p class="hint">Da categoria com maior gasto para a menor. Toque em “Ver lançamentos” para conferir. O filtro de categoria altera apenas este gráfico.</p>
      <div class="category-bars" role="list" aria-label="Gastos por categoria em ordem de maior valor">${cats.map(c=>`<div class="category-bar-row" role="listitem"><div><span>${e(c.icon)} ${e(c.name)}</span><strong>${currency(c.total)}</strong></div><div class="progress large" role="img" aria-label="${e(c.name)}: ${e(currency(c.total))}, ${(c.total/Math.max(report.spending,1)*100).toFixed(0)}% dos gastos"><i style="width:${c.total/max*100}%"></i></div><div class="category-bar-footer"><small>${(c.total/Math.max(report.spending,1)*100).toFixed(0)}% dos gastos</small>${button('Ver lançamentos','summary-transactions','','btn small',`data-id="${e(c.id)}"`)}</div></div>`).join('')||'<p class="muted">Nenhum gasto para estes filtros. Escolha outro mês, conta, cartão ou categoria.</p>'}</div>
    </section>
    ${report.hiddenCount?`<div class="notice">Há ${report.hiddenCount} lançamento(s) oculto(s) nesta conta ou cartão. Eles continuam no saldo e nas faturas, mas ficam fora do gráfico de gastos. ${button('Ver ocultos','show-hidden','','btn small')}</div>`:''}
    <section class="panel summary-accounts">${cardHeading('Saldo por conta','Gerenciar contas','accounts')}<p class="hint">Cartão de crédito tem limite e fatura; o dinheiro disponível fica nas contas.</p>${report.accounts.map(a=>`<div class="summary-account-row">${institutionUI.badge(a,'wallet',{name:a.name})}<strong>${currency(accountBalance(state,a.id))}</strong></div>`).join('')}</section>`;
}
function filteredTransactions() {
  let rows=filters.hiddenOnly?state.transactions.filter(t=>t.hidden&&(!account||t.accountId===account)):filters.summary?summaryFor(state,month,{accountId:account,cardId:filters.cardId}).rows:filters.cardId?financialReport(state,month,{cardId:filters.cardId}).rows:monthlyRows(state,month,{account,hidden:filters.hidden,basis:filters.basis||'consumption',includeCancelled:true});
  const uncategorized=uncategorizedOption(state);
  rows=rows.filter(t=>(!filters.recurrenceId||t.recurringTransactionId===filters.recurrenceId)&&(filters.hidden||!t.hidden)&&(!filters.category||(t.categoryId||uncategorized.id)===filters.category)&&(!filters.kind||t.type===filters.kind)&&(!filters.search||normalize(t.description).includes(normalize(filters.search)))&&(!filters.status||(t.status||'completed')===filters.status));
  if(filters.day)rows=rows.filter(t=>Number((t.effectiveDate||t.date).slice(8))===Number(filters.day));
  rows.sort((a,b)=>(b.effectiveDate||b.date).localeCompare(a.effectiveDate||a.date)||a.description.localeCompare(b.description,'pt-BR'));
  if(filters.sort==='oldest')rows.reverse();
  if(filters.sort==='highest')rows.sort((a,b)=>b.amount-a.amount);
  if(filters.sort==='lowest')rows.sort((a,b)=>a.amount-b.amount);
  return rows;
}
function transactionInstitution(transaction) {
  const card=state.cards.find(item=>item.id===transaction.cardId);
  const record=card||acct(transaction.accountId);
  return institutionUI.badge(record,card?'card':'wallet',{name:record.name});
}
function renderTransactions(){const rows=filteredTransactions(),t=totals(rows,{basis:filters.cardId?'consumption':filters.basis||'consumption'}),size=10;page=Math.min(page,Math.max(1,Math.ceil(rows.length/size)));return `${pageHeader('Transações','Organize, encontre e acompanhe suas transações.',button('Importar','import','upload')+button('Nova transação','transaction','plus','btn primary'))}<div class="filters-bar">${periodControl()}<select id="account-filter" aria-label="Filtrar conta"><option value="">Todas as contas</option>${options(state.accounts,account)}</select><select id="type-filter" aria-label="Filtrar tipo"><option value="">Todas as transações</option>${['expense','income','transfer'].map((x,i)=>`<option value="${x}" ${selected(x,filters.kind)}>${['Despesas','Receitas','Transferências'][i]}</option>`).join('')}</select><select id="transaction-card-filter" aria-label="Filtrar cartão"><option value="">Todos os cartões e contas</option>${options(state.cards,filters.cardId||'')}</select><select id="category-filter" aria-label="Filtrar categoria"><option value="">Todas as categorias</option>${options([...state.categories,uncategorizedOption(state)],filters.category)}</select><select id="status-filter" aria-label="Filtrar situação"><option value="">Todas as situações</option>${[['completed','Pago / recebido'],['pending','Pendente'],['cancelled','Cancelado']].map(([v,l])=>`<option value="${v}" ${selected(v,filters.status)}>${l}</option>`).join('')}</select><label class="toggle-label"><input type="checkbox" id="hidden-filter" ${filters.hidden?'checked':''}> Incluir lançamentos ocultos</label>${filters.recurrenceId?button('Sair da recorrência','clear-recurrence-filter','','btn small'):''}${filters.day?button(`Dia ${filters.day} ×`,'clear-day','','btn small'):''}</div>${filters.hiddenOnly?`<div class="notice">Mostrando apenas os lançamentos ocultos de todos os meses. ${button('Voltar às transações','clear-special-view','','btn small')}</div>`:filters.summary?`<div class="notice">Gastos do Resumo: despesas da conta e parcelas dos cartões. ${button('Ver todas as transações','clear-special-view','','btn small')}</div>`:''}<div class="transaction-help">Toque na descrição para editar. ${button('Ver ocultos','show-hidden','eye','btn small')}${button('Corrigir importados','correct-imported','edit','btn small')}</div><div class="stats-row four">${statCard('Transações',t.count,'repeat','Registros no filtro')}${statCard('Despesas',currency(t.expense),'arrow',filters.basis==='cash'?'Pagamentos efetivos':'Despesas por lançamento')}${statCard('Receitas',currency(t.income),'arrow',filters.basis==='cash'?'Recebimentos efetivos':'Receitas por lançamento','income-card')}${statCard('Resultado',currency(t.balance),'wallet','Receitas menos despesas')}</div><section class="panel table-panel transactions-panel"><div class="table-toolbar"><label class="search">${icon('search')}<input id="search" aria-label="Buscar transações" placeholder="Buscar uma transação..." value="${e(filters.search)}"></label><div><select id="sort-filter" aria-label="Ordenar transações">${[['newest','Mais recentes'],['oldest','Mais antigas'],['highest','Maior valor'],['lowest','Menor valor']].map(([k,l])=>`<option value="${k}" ${selected(k,filters.sort)}>${l}</option>`).join('')}</select>${button('Exportar','export-csv','download','btn small')}</div></div><div class="table-scroll"><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Conta</th><th>Data</th><th class="right">Valor</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows.slice((page-1)*size,page*size).map(t=>`<tr class="${t.hidden?'is-hidden':''}"><td><button class="table-description" data-action="transaction" data-id="${e(t.id)}"><span class="category-icon">${e(cat(t.categoryId).icon)}</span><span>${e(t.description)}${t.recurringTransactionId?'<small>Ocorrência recorrente</small>':''}${t.isSubscription?'<small>Assinatura identificada</small>':''}${t.hidden?'<small>Oculta dos relatórios</small>':''}${t.cardId?`<small>No cartão${t.installmentTotal?' · parcela '+(t.installmentIndex+1)+'/'+t.installmentTotal:t.installmentCount>1?' · '+t.installmentCount+' parcelas':''}</small>`:''}${t.invoicePaymentId?'<small>Pagamento de fatura · protegido</small>':t.status==='pending'?'<small>Pendente · sem alterar saldo</small>':t.status==='cancelled'?'<small>Cancelado · preservado no histórico</small>':''}</span></button></td><td data-label="Categoria"><button class="category-chip" data-action="category-filter" data-id="${e(t.categoryId)}">${e(cat(t.categoryId).name)}</button></td><td data-label="Conta / cartão">${transactionInstitution(t)}</td><td data-label="Data">${(t.effectiveDate||t.date).split('-').reverse().join('/')}</td><td data-label="Valor" class="right amount ${t.type==='income'?'positive':''}">${t.type==='income'?'+ ':t.type==='expense'?'− ':'↔ '}${currency(t.amount)}</td><td><button class="btn small" aria-label="Editar ${e(t.description)}" title="Editar transação" data-action="transaction" data-id="${e(t.id)}">${icon('edit',16)}<span>Editar</span></button>${t.status==='pending'&&!t.cardId?button('Registrar pagamento','transaction-settle','check','btn small',`data-id="${e(t.id)}" aria-label="Registrar pagamento de ${e(t.description)}"`):''}<button class="btn small" aria-label="${t.hidden?'Restaurar':'Ocultar'} ${e(t.description)}" title="${t.hidden?'Restaurar':'Ocultar dos relatórios'}" data-action="hide-transaction" data-id="${e(t.id)}">${icon('eye',16)}<span>${t.hidden?'Exibir novamente':'Ocultar'}</span></button></td></tr>`).join('')}</tbody></table></div>${!rows.length?empty('Nenhuma transação encontrada','Experimente outros filtros ou registre uma nova transação.'):''}<div class="table-footer"><span>Mostrando ${rows.length?(page-1)*size+1:0}–${Math.min(page*size,rows.length)} de ${rows.length}</span><div>${button('Anterior','prev-page','','btn small',page<=1?'disabled':'')}<span class="page-number">${page} / ${Math.max(1,Math.ceil(rows.length/size))}</span>${button('Próxima','next-page','','btn small',page*size>=rows.length?'disabled':'')}</div></div></section><div class="filters-bar report-mode"><select id="transaction-basis" aria-label="Regime das transações" ${filters.cardId||filters.summary||filters.hiddenOnly?'disabled':''}><option value="consumption" ${selected(filters.basis||'consumption','consumption')}>Pela data da compra</option><option value="cash" ${selected(filters.basis,'cash')}>Pela data do pagamento</option></select>${filters.cardId?button('Sair da fatura','clear-card-filter','','btn small'):''}<span class="muted">${filters.summary?'Despesas da conta e parcelas dos cartões pelo mês do Resumo.':filters.hiddenOnly?'Lançamentos ocultos de todos os meses.':filters.cardId?'Mostrando apenas as parcelas desta fatura.':filters.basis==='cash'?'Somente liquidados, pela data efetiva.':'Gastos por lançamento, sem duplicar o pagamento de fatura.'}</span></div><p class="hint">Transferências entre contas não entram no cálculo de receitas e despesas. Lançamentos ocultos ficam fora dos relatórios.</p>`;}
function visibilityModal(id){
  const item=state.transactions.find(t=>t.id===id);if(!item)return;
  if(item.hidden){commit(s=>{s.transactions.find(t=>t.id===id).hidden=false;},'Lançamento exibido novamente na lista e nos relatórios.');return;}
  openModal('Ocultar este lançamento?',`<p><strong>${e(item.description)}</strong></p><p>Ele sairá da lista e dos relatórios de gastos. O saldo da conta e o valor da fatura continuam iguais. Você poderá recuperá-lo em “Incluir lançamentos ocultos”.</p><form>${formFooter('Ocultar lançamento')}</form>`,{onSubmit:()=>{commit(s=>{s.transactions.find(t=>t.id===id).hidden=true;},'Lançamento oculto. Para recuperar, toque em “Ver ocultos”.');closeModal();}});
}
function transactionModal(id='',presetCard='') {
  if(!state.accounts.length)return toast('Cadastre uma conta primeiro.');
  const t=state.transactions.find(x=>x.id===id);
  if(t?.invoicePaymentId||t&&hasPaidPurchase(state,t.id)) {
    openModal('Registro protegido',`<p class="muted">${e(t.description)}</p><p>Este registro está vinculado a uma fatura paga e não pode ser editado isoladamente. Isso preserva o saldo e o histórico do pagamento.</p>${operationsUI.toolbar(t.id)}`);
    return;
  }
  const chosenCard=state.cards.find(c=>c.id===presetCard);
  const d=t||{amount:'',description:'',date:localDate(),type:'expense',status:'completed',categoryId:'other',accountId:chosenCard?.accountId||account||state.accounts[0].id,cardId:chosenCard?.id||'',toAccountId:state.accounts[1]?.id||'',installmentCount:1};
  const status=d.status||'completed';
  openModal(t?'Editar transação':'Nova transação',`<form id="transaction-form">
    <div class="form-grid">${field('Valor total (R$)','amount',d.amount?(d.amount/100).toFixed(2).replace('.',','):'','text','required inputmode="decimal" placeholder="0,00"')}
    ${selectField('Tipo','type',[['expense','Despesa'],['income','Receita'],['transfer','Transferência entre contas']].map(([v,l])=>`<option value="${v}" ${selected(v,d.type)}>${l}</option>`).join(''))}</div>
    ${field('Descrição','description',d.description,'text','required maxlength="240" placeholder="Ex.: Mercado da semana"')}
    <div class="form-grid">${selectField('Conta de origem','accountId',options(state.accounts,d.accountId))}
    ${selectField('Categoria','categoryId',options(state.categories,d.categoryId))}
    ${field('Data do lançamento / compra','date',d.date,'date',`required ${t?.recurringTransactionId?'readonly':''}`)}
    ${selectField('Cartão (opcional)','cardId','<option value="">Sem cartão</option>'+options(state.cards,d.cardId))}</div>
    <div id="purchase-installments" ${d.cardId?'':'hidden'}>
      ${field('Quantidade de parcelas','installmentCount',d.installmentCount||1,'number','min="1" max="600" required')}
      <p class="hint">Informe o valor total. As parcelas são divididas em centavos e distribuídas pelas faturas. A compra compromete o limite; o saldo da conta muda ao registrar o pagamento da fatura.</p>
    </div>
    <div id="cash-status" ${d.cardId?'hidden':''}><div class="form-grid">
      ${selectField('Situação','status',[['completed','Pago / recebido'],['pending','Pendente'],['cancelled','Cancelado']].map(([v,l])=>`<option value="${v}" ${selected(v,status)}>${l}</option>`).join(''))}
      ${field('Data de pagamento / recebimento','settledAt',d.settledAt||d.date,'date')}</div></div>
    <div id="transfer-destination" ${d.type==='transfer'?'':'hidden'}>${selectField('Conta de destino','toAccountId','<option value="">Selecione uma conta</option>'+options(state.accounts,d.toAccountId))}</div>
    <p class="hint">Lançamentos pendentes ou cancelados não alteram saldos. Transferências exigem contas diferentes e não entram em receitas ou despesas.</p>
    ${formFooter(t?'Salvar alterações':'Adicionar transação')}</form>`,{onSubmit:form=>{
      const amount=moneyInput(form.get('amount'));
      if(amount<=0)throw new Error('O valor deve ser maior que zero.');
      const type=form.get('type'),accountId=form.get('accountId'),toAccountId=type==='transfer'?form.get('toAccountId'):'';
      if(type==='transfer'&&(!toAccountId||toAccountId===accountId))throw new Error('Escolha uma conta de destino diferente da origem.');
      const cardId=type==='expense'?form.get('cardId'):'',status=cardId?'completed':form.get('status');
      const item={...t,id:t?.id||uid(),amount,type,status,description:form.get('description').trim(),date:form.get('date'),categoryId:form.get('categoryId'),accountId,toAccountId,cardId,hidden:t?.hidden||false,source:t?.source||'manual'};
      if(cardId){item.installmentCount=Number(form.get('installmentCount'));delete item.settledAt;}
      else {delete item.installmentCount;item.settledAt=status==='completed'?form.get('settledAt'):null;if(status==='completed'&&!item.settledAt)throw new Error('Informe a data de pagamento ou recebimento.');}
      if(t)assertPurchaseEditable(state,t.id);
      assertPurchaseAllowed(state,item);
      commit(s=>{if(t)s.transactions[s.transactions.findIndex(x=>x.id===t.id)]=item;else s.transactions.push(item);},'Transação salva.');
      closeModal();
    }});
  const form=$('#transaction-form');
  const refresh=()=>{
    const credit=form.elements.type.value==='expense'&&form.elements.cardId.value;
    form.elements.cardId.disabled=form.elements.type.value!=='expense';
    $('#purchase-installments').hidden=!credit;
    form.elements.installmentCount.disabled=!credit;
    $('#cash-status').hidden=!!credit;
    $('#transfer-destination').hidden=form.elements.type.value!=='transfer';
    form.elements.settledAt.disabled=!!credit||form.elements.status.value!=='completed';
    form.elements.settledAt.required=!form.elements.settledAt.disabled;
  };
  form.addEventListener('change',refresh);refresh();
  if(t){form.insertAdjacentHTML('afterend',operationsUI.toolbar(t.id));if(t.recurringTransactionId)form.insertAdjacentHTML('afterbegin','<p class="hint">A data original desta ocorrência é protegida. Ajuste a liquidação para registrar o pagamento em outro dia.</p>');}
}
function renderInstallments() {
  const items=[...state.installments,...creditInstallmentPlans(state)],summary=installmentSummary(items);
  return `${pageHeader('Planos que cabem <span>no seu mês.</span>','Parcelamentos manuais e compras de cartão no mesmo lugar.',button('Adicionar compra manual','installment','plus','btn primary'))}
  <div class="stats-row four">${statCard('Em andamento',summary.count,'card','Compras parceladas')}${statCard('Valor total',currency(summary.total),'wallet','Compras em andamento')}${statCard('Já pago',currency(summary.paid),'check','Parcelas registradas','income-card')}${statCard('Restante',currency(summary.remaining),'calendar',`${currency(summary.monthly)} por mês`)}</div>
  <div class="panel overall-progress"><div><span>Progresso geral</span><strong>${summary.total?Math.round(summary.paid/summary.total*100):0}% pago</strong></div><div class="progress large"><i style="width:${summary.total?summary.paid/summary.total*100:0}%"></i></div></div>
  <div class="section-title"><h2>Suas compras parceladas</h2><span class="muted">${items.length} registros</span></div>
  <div class="installment-grid">${items.map(item=>{
    const remaining=(item.totalAmount??item.amount*item.count)-(item.paidAmount??item.amount*item.paid);
    const percent=(item.paidAmount??item.amount*item.paid)/(item.totalAmount??item.amount*item.count)*100;
    return `<section class="panel installment-card"><div class="card-heading"><span class="category-icon">${e(cat(item.categoryId).icon)}</span>${badge(item.paid>=item.count?'Finalizada':item.cardId?'Vinculada à fatura':'Controle manual',item.paid>=item.count?'soft':'')}</div>
      <h3>${e(item.name)}</h3><p class="muted">${e(acct(item.accountId).name)} · ${item.paid}/${item.count} parcelas pagas</p>
      <div class="installment-amount">${currency(item.amount)}<span>/parcela</span></div><div class="progress large"><i style="width:${percent}%"></i></div>
      <div class="installment-footer"><small>${currency(remaining)} restante</small>${button('Editar',item.cardId?'transaction':'installment','edit','btn small',`data-id="${e(item.id)}"`)}</div>
      ${item.cardId?button('Ver próxima fatura','plan-invoice','card','btn full',`data-id="${e(item.cardId)}" data-month="${e(item.nextMonth)}"`):button(item.paid>=item.count?'Concluída':'Marcar próxima como paga','pay-installment','check','btn full',`data-id="${e(item.id)}" ${item.paid>=item.count?'disabled':''}`)}
    </section>`;
  }).join('')||empty('Nenhum parcelamento','Cadastre uma compra para acompanhar.','installment','Adicionar compra')}</div>
  <p class="hint">Compras no cartão são atualizadas pelo registro do pagamento de cada fatura. O controle manual separado não cria lançamentos nem movimenta dinheiro.</p>`;
}
function installmentModal(id=''){const item=state.installments.find(x=>x.id===id);openModal(item?'Editar parcelamento':'Nova compra parcelada',`<form>${field('Descrição da compra','name',item?.name||'','text','required maxlength="100"')}<div class="form-grid">${field('Valor de cada parcela (R$)','amount',item?String(item.amount/100).replace('.',','):'','text','required inputmode="decimal"')}${field('Total de parcelas','count',item?.count||12,'number','min="1" max="600" required')}${field('Parcelas já pagas','paid',item?.paid||0,'number','min="0" max="600" required')}${selectField('Conta','accountId',options(state.accounts,item?.accountId||state.accounts[0]?.id))}${selectField('Categoria','categoryId',options(state.categories,item?.categoryId||'shopping'))}</div>${formFooter()}</form>`,{onSubmit:f=>{const amount=moneyInput(f.get('amount')),count=Number(f.get('count')),paid=Number(f.get('paid'));if(amount<=0||!Number.isInteger(count)||count<1||count>600||!Number.isInteger(paid)||paid<0||paid>count)throw new Error('Revise o valor e a quantidade de parcelas.');const next={...item,id:item?.id||uid(),name:f.get('name').trim(),amount,count,paid,accountId:f.get('accountId'),categoryId:f.get('categoryId'),hidden:false};commit(s=>{if(item)s.installments[s.installments.findIndex(x=>x.id===id)]=next;else s.installments.push(next);},'Parcelamento atualizado.');closeModal();}});}
function renderSubscriptions(){const active=state.subscriptions.filter(x=>x.active),total=active.reduce((n,x)=>n+(x.cycle==='year'?Math.round(x.amount/12):x.amount),0);return `${pageHeader('Assinaturas <span>sob controle.</span>','Veja o custo real dos serviços que fazem parte da sua rotina.',button('Gerenciar recorrências','recurrences','repeat')+button('Adicionar assinatura','subscription','plus','btn primary'))}<div class="stats-row four">${statCard('Assinaturas ativas',active.length,'repeat','Serviços cadastrados')}${statCard('Gasto mensal',currency(total),'calendar','Equivalente por mês')}${statCard('Projeção anual',currency(total*12),'chart','Com base nos valores atuais')}${statCard('Média por serviço',currency(active.length?Math.round(total/active.length):0),'wallet','Equivalente mensal')}</div>${subscriptionCalendarUI.renderCalendar()}<div class="subscriptions-grid">${state.subscriptions.map((x,i)=>`<section class="panel subscription-card"><div class="card-heading"><span class="service-icon service-${i%3}">${e(x.name.slice(0,1))}</span><button role="switch" aria-checked="${x.active}" aria-label="Ativar ${e(x.name)}" class="switch ${x.active?'on':''}" data-action="toggle-subscription" data-id="${e(x.id)}"><i></i></button></div><h3>${e(x.name)}</h3><p class="muted">${e(acct(x.accountId).name)} ${badge(x.active?'Ativa':'Pausada',x.active?'soft':'')}</p><div class="subscription-price">${currency(x.amount)}<small>/${x.cycle==='year'?'ano':'mês'}</small></div><div class="subscription-next">${icon('calendar',16)} Próxima cobrança: ${dateLabel(x.nextDate)}</div>${button('Editar assinatura','subscription','edit','btn full',`data-id="${e(x.id)}"`)}${recurrenceUI.subscriptionButtons(x.id)}</section>`).join('')||empty('Nenhuma assinatura cadastrada','Registre serviços recorrentes para visualizar seus custos.','subscription','Adicionar assinatura')}</div>`;}
function subscriptionModal(id=''){if(recurrenceUI.editLinkedSubscription(id))return;const x=state.subscriptions.find(x=>x.id===id);openModal(x?'Editar assinatura':'Nova assinatura',`<form>${field('Nome do serviço','name',x?.name||'','text','required maxlength="100"')}<div class="form-grid">${field('Valor (R$)','amount',x?String(x.amount/100).replace('.',','):'','text','required inputmode="decimal"')}${selectField('Frequência','cycle',`<option value="month" ${selected(x?.cycle,'month')}>Mensal</option><option value="year" ${selected(x?.cycle,'year')}>Anual</option>`)}${field('Próxima cobrança','nextDate',x?.nextDate||localDate(),'date','required')}${selectField('Conta','accountId',options(state.accounts,x?.accountId||state.accounts[0]?.id))}</div>${formFooter()}</form>`,{onSubmit:f=>{const amount=moneyInput(f.get('amount'));if(amount<=0)throw new Error('Informe um valor maior que zero.');const next={id:x?.id||uid(),name:f.get('name').trim(),amount,cycle:f.get('cycle'),nextDate:f.get('nextDate'),accountId:f.get('accountId'),categoryId:x?.categoryId||'digital',active:x?.active??true};commit(s=>{if(x)s.subscriptions[s.subscriptions.findIndex(y=>y.id===id)]=next;else s.subscriptions.push(next);},'Assinatura salva.');closeModal();}});}
function renderCategories(){const cats=categoryTotals(state,month,account),total=cats.reduce((s,c)=>s+c.total,0),budget=cats.reduce((s,c)=>s+c.budget,0);return `${pageHeader('Um destino <span>para cada real.</span>','Conheça seus hábitos e defina limites que fazem sentido.',periodControl()+button('Nova categoria','category','plus','btn primary'))}<div class="stats-row">${statCard('Gastos do mês',currency(total),'tag','Despesas categorizadas')}${statCard('Orçamento total',currency(budget),'wallet','Soma dos limites definidos')}${statCard('Disponível no orçamento',currency(budget-total),'pie',`${cats.filter(c=>c.budget&&c.total>c.budget).length} categorias acima do limite`)}</div><div class="categories-grid">${cats.map(c=>`<section class="panel budget-card"><div class="card-heading"><span class="category-icon">${e(c.icon)}</span><button class="icon-btn" aria-label="Editar orçamento de ${e(c.name)}" data-action="category" data-id="${e(c.id)}">${icon('edit',16)}</button></div><h3>${e(c.name)}</h3><div class="budget-value">${currency(c.total)}<small>${c.budget?'de '+currency(c.budget):'Sem limite definido'}</small></div><div class="progress large ${c.budget&&c.total>c.budget?'over':''}"><i style="width:${c.budget?Math.min(100,c.total/c.budget*100):0}%"></i></div><div class="budget-footer"><span class="${c.budget&&c.total>c.budget?'negative':'muted'}">${c.budget?(c.total>c.budget?currency(c.total-c.budget)+' acima':currency(c.budget-c.total)+' disponíveis'):'Defina um orçamento'}</span><button class="text-link" data-action="category-filter" data-id="${e(c.id)}">Ver gastos ${icon('arrow',13)}</button></div></section>`).join('')}</div>`;}
function categoryModal(id=''){const c=state.categories.find(x=>x.id===id);openModal(c?'Editar categoria':'Nova categoria',`<form><div class="form-grid icon-field">${field('Ícone','icon',c?.icon||'◌','text','required maxlength="12"')}${field('Nome','name',c?.name||'','text','required maxlength="80"')}</div>${field('Orçamento mensal (R$)','budget',c?String(c.budget/100).replace('.',','):'0','text','required inputmode="decimal"')}<p class="hint">Use zero para deixar a categoria sem limite de gastos.</p>${formFooter()}</form>`,{onSubmit:f=>{const budget=moneyInput(f.get('budget'));if(budget<0)throw new Error('O orçamento não pode ser negativo.');const item={...c,id:c?.id||uid(),name:f.get('name').trim(),icon:f.get('icon').trim(),budget,keywords:c?.keywords||[]};commit(s=>{if(c)s.categories[s.categories.findIndex(x=>x.id===id)]=item;else s.categories.push(item);},'Categoria salva.');closeModal();}});}
const invoiceStatusLabels={open:'Aberta',closed:'Fechada',overdue:'Atrasada',paid:'Paga'};
function renderPendingInvoices(title,invoices,total) {
  if(!invoices.length)return '';
  return `<section class="panel summary-accounts" aria-label="${e(title)}">
    ${cardHeading(title)}
    <div class="summary-account-row"><span>Total a pagar</span><strong>${currency(total)}</strong></div>
    ${invoices.map(invoice=>`<div class="summary-account-row"><span class="invoice-identity">${institutionUI.badge(state.cards.find(card=>card.id===invoice.cardId),'card')}<span>${button(invoice.name,'invoice-details','','text-link',`data-id="${e(invoice.cardId)}" data-month="${e(invoice.month)}"`)}<br><small>${dateLabel(invoice.dueDate)} · ${invoiceStatusLabels[invoice.status]}</small></span></span><strong>${currency(invoice.remainingAmount)}</strong></div>`).join('')}
  </section>`;
}
function renderCards() {
  return `${pageHeader('Seus cartões, <span>em perspectiva.</span>','Escolha o mês do vencimento para conferir cada fatura.',periodControl()+button('Adicionar cartão','card','plus','btn primary'))}
    <div class="cards-grid">${state.cards.map(card=>{
      const invoice=invoiceFor(state,card,month,localDate()),limit=cardCommitment(state,card);
      return `<section class="panel credit-card-panel">
        <div class="visual-card" style="${institutionUI.colors(institutionIdentity(card.institutionId))}"><div class="card-top">${institutionUI.badge(card,'card',{name:card.name})}</div><div class="chip"></div><div class="card-digits">Cartão de crédito</div><div class="card-bottom"><span>${e(state.profile.name.toUpperCase())}</span><strong>MAX</strong></div></div>
        <div class="invoice"><span>Fatura com vencimento em ${e(monthName(month))}</span><strong>${currency(invoice.total)}</strong>
          ${badge(invoice.payment?'Paga · '+dateLabel(invoice.payment.date):invoiceStatusLabels[invoice.status]+' · vence '+dateLabel(invoice.dueDate),invoice.payment?'soft':'')}
          ${invoice.paidAmount?`<small>Pago ${currency(invoice.paidAmount)} · Saldo ${currency(invoice.remainingAmount)}</small>`:''}
          <small class="muted">${invoice.configured?'Ciclo: '+dateLabel(invoice.startDate)+' até antes de '+dateLabel(invoice.closingDate):'Cartão antigo: confira o dia de fechamento antes de pagar.'}</small>
        </div>
        <div class="limit-stats"><div><small>Limite total</small><strong>${currency(card.limit)}</strong></div><div><small>Comprometido</small><strong>${currency(limit.used)}</strong></div><div><small>Disponível</small><strong class="positive">${currency(limit.available)}</strong></div></div>
        <div class="progress large"><i style="width:${card.limit?Math.min(100,limit.used/card.limit*100):0}%"></i></div>
        <div class="credit-card-footer">${button('Ver fatura','invoice-details','repeat','btn',`data-id="${e(card.id)}"`)}${button('Nova compra','card-purchase','plus','btn',`data-id="${e(card.id)}"`)}${button('Editar','card','edit','btn',`data-id="${e(card.id)}"`)}</div>
        <div class="invoice-actions">${button(invoice.payment?'Pagamento registrado':'Registrar pagamento','invoice-pay','check','btn primary',`data-id="${e(card.id)}" ${!invoice.remainingAmount||!invoice.configured?'disabled':''}`)}<small>${invoice.items.length} parcela(s) nesta fatura. O limite considera todas as parcelas ainda não pagas.</small></div>
      </section>`;
    }).join('')||empty('Nenhum cartão cadastrado','Cadastre um cartão para acompanhar compras e limites.','card','Adicionar cartão')}</div>
    <div class="notice">${icon('card')} Este é um controle de faturas. Registrar um pagamento lança a saída na conta escolhida aqui; a operação no seu banco deve ser feita por você.</div>`;
}
function invoiceDetails(id,reference=month) {
  const card=state.cards.find(c=>c.id===id),invoice=invoiceFor(state,card,reference,localDate());
  const candidates=invoice.status==='paid'?[]:csvCardCorrectionCandidates(state,card,reference);
  openModal('Fatura · '+card.name,`${institutionUI.badge(card,'card')}<div class="invoice-detail-summary"><div><span class="eyebrow">${e(monthName(reference))}</span><strong>Original ${currency(invoice.total)}</strong></div>${badge(invoiceStatusLabels[invoice.status],invoice.payment?'soft':'')}</div>
    <p>Pago ${currency(invoice.paidAmount)} · Saldo ${currency(invoice.remainingAmount)} · Vencimento ${dateLabel(invoice.dueDate)}</p>
    <p class="muted">${invoice.configured?'Compras de '+dateLabel(invoice.startDate)+' até antes de '+dateLabel(invoice.closingDate):'Informe o dia de fechamento para calcular o ciclo correto.'}</p>
    ${invoice.remainingAmount&&invoice.configured?button('Registrar pagamento','invoice-pay','check','btn primary',`data-id="${e(id)}" data-month="${e(reference)}"`):''}
    ${invoice.payments.length?`<h3>Pagamentos</h3>${invoice.payments.map(payment=>`<div class="summary-account-row"><span>${currency(payment.amount)} · ${dateLabel(payment.date)} · ${e(acct(payment.accountId).name)}${payment.cancelledAt?` · Cancelado em ${dateLabel(payment.cancelledAt)}`:''}</span>${payment.cancelledAt?'':button('Editar','invoice-payment-edit','','btn small',`data-id="${e(payment.id)}"`)+button('Cancelar pagamento','invoice-payment-cancel','','btn small',`data-id="${e(payment.id)}"`)}</div>`).join('')}`:''}
    <div class="invoice-item-list">${invoice.items.map(item=>`<button class="transaction-item" data-action="transaction" data-id="${e(item.transactionId)}"><span class="category-icon">${e(cat(item.categoryId).icon)}</span><span class="transaction-info"><strong>${e(item.description)}</strong><small>${e(cat(item.categoryId).name)} · Parcela ${item.index+1}/${item.count} · compra em ${dateLabel(item.purchaseDate)}</small></span><strong class="amount">${currency(item.amount)}</strong></button>`).join('')||'<p class="muted">Nenhuma parcela nesta fatura.</p>'}</div>
    ${candidates.length?'<button class="btn" type="button" id="link-imported-purchases">Vincular despesas importadas</button>':''}`,{wide:true});
  $('#link-imported-purchases')?.addEventListener('click',()=>linkImportedPurchases(card,reference,candidates));
}
function linkImportedPurchases(card,reference,candidates){
  let reviewed=null;
  openModal('Vincular despesas importadas',`<form id="link-imported-form">
    <p><strong>${e(card.name)} · ${e(monthName(reference))}</strong></p>
    <p>Selecione apenas lançamentos que constam na fatura do cartão. Os registros serão movidos do extrato da conta para a fatura.</p>
    <div class="correction-list">${candidates.map(row=>`<label class="correction-item"><input type="checkbox" name="transactionId" value="${e(row.id)}"><span><strong>${e(row.description)}</strong><small>${dateLabel(row.date)} · ${e(cat(row.categoryId).name)} · ${currency(row.amount)}</small></span></label>`).join('')}</div>
    <div id="link-imported-preview" role="status"></div>
    ${formFooter('Revisar vínculo')}
  </form>`,{wide:true,onSubmit:async data=>{
    if(!reviewed){
      const plan=planCsvCardCorrection(state,{ids:data.getAll('transactionId'),cardId:card.id,month:reference});
      reviewed={snapshot:state,plan};
      $('#link-imported-preview').innerHTML=`<div class="notice">${plan.count} lançamento(s) serão movidos para a fatura.</div>
        <p>Saldo da conta ${e(acct(card.accountId).name)}: ${currency(plan.accountBefore)} → <strong>${currency(plan.accountAfter)}</strong></p>
        <p>Saldo a pagar na fatura: ${currency(plan.invoiceBefore.remainingAmount)} → <strong>${currency(plan.invoiceAfter.remainingAmount)}</strong></p>`;
      $('#link-imported-form [type="submit"]').textContent='Confirmar vínculo';
      return;
    }
    if(state!==reviewed.snapshot)throw new Error('Os dados mudaram. Feche e abra a fatura para revisar novamente.');
    const {plan}=reviewed;
    await commitConfirmed(next=>{next.transactions=plan.transactions;},`${plan.count} lançamento(s) vinculados à fatura.`);
  }});
  const form=$('#link-imported-form');
  form.addEventListener('change',()=>{
    reviewed=null;
    $('#link-imported-preview').replaceChildren();
    form.querySelector('.form-error')?.remove();
    form.querySelector('[type="submit"]').textContent='Revisar vínculo';
  });
}
function invoicePaymentModal(id,reference=month,payment) {
  const card=state.cards.find(c=>c.id===id),invoice=invoiceFor(state,card,reference);
  if(!payment&&(!invoice.remainingAmount||!invoice.configured))return toast('A fatura precisa ter saldo e fechamento configurado.');
  const paymentId=payment?.id||uid();
  const amount=payment?.amount??invoice.remainingAmount;
  openModal(payment?'Editar pagamento de fatura':'Registrar pagamento de fatura',`<div class="invoice-detail-summary"><div><span class="eyebrow">${e(card.name)} · ${e(monthName(reference))}</span><strong>Saldo ${currency(invoice.remainingAmount)}</strong></div></div>
    <form>${selectField('Conta de pagamento','accountId',options(state.accounts,payment?.accountId||card.accountId))}
    ${field('Data do pagamento','date',payment?.date||localDate(),'date','required')}
    ${field('Valor pago','amount',String(amount/100).replace('.',','),'text','required')}
    ${payment?'':'<label class="check-label"><input type="checkbox" required> Confirmo o registro deste pagamento no meu controle financeiro.</label>'}
    ${formFooter(payment?'Salvar pagamento':'Registrar pagamento')}</form>`,{onSubmit:form=>{
      const data={accountId:form.get('accountId'),date:form.get('date'),amount:moneyInput(form.get('amount'))};
      return payment
        ?commitConfirmed(s=>editInvoicePayment(s,paymentId,data),'Pagamento atualizado.')
        :commitConfirmed(s=>registerInvoicePayment(s,{...data,cardId:id,month:reference,id:paymentId}),'Pagamento registrado.');
    }});
}
function invoicePaymentCancelModal(id) {
  const payment=state.invoicePayments.find(item=>item.id===id);
  openModal('Cancelar pagamento de fatura',`<form><p>O cancelamento de ${currency(payment.amount)} devolve o valor ao saldo de ${e(acct(payment.accountId).name)} e recalcula o saldo da fatura.</p>${formFooter('Cancelar pagamento')}</form>`,{
    onSubmit:()=>commitConfirmed(s=>cancelInvoicePayment(s,id,localDate()),'Pagamento cancelado.'),
  });
}
function cardModal(id='') {
  const card=state.cards.find(c=>c.id===id);
  openModal(card?'Editar cartão':'Novo cartão',`<form>
    ${field('Nome do cartão','name',card?.name||'','text','required maxlength="80"')}
    ${institutionUI.picker(card,'card')}
    <div class="form-grid">
    ${field('Limite total (R$)','limit',card?String(card.limit/100).replace('.',','):'','text','required inputmode="decimal"')}
    ${field('Dia do fechamento','closingDay',card?.closingDay||'','text','required maxlength="2" pattern="(?:[1-9]|[12][0-9]|3[01])" title="Informe um dia de 1 a 31"')}
    ${field('Dia do vencimento','dueDay',card?.dueDay||10,'text','required maxlength="2" pattern="(?:[1-9]|[12][0-9]|3[01])" title="Informe um dia de 1 a 31"')}
    ${selectField('Conta vinculada','accountId',options(state.accounts,card?.accountId||state.accounts[0]?.id))}</div>
    <p class="hint">Compra no dia do fechamento entra na próxima fatura. O mês da fatura é o do vencimento. Em meses curtos, o dia é ajustado para o último dia existente.</p>${formFooter()}</form>`,{onSubmit:form=>{
      const limit=moneyInput(form.get('limit'));
      if(limit<0)throw new Error('O limite não pode ser negativo.');
      const next={...card,id:card?.id||uid(),name:form.get('name').trim(),limit,closingDay:Number(form.get('closingDay')),dueDay:Number(form.get('dueDay')),accountId:form.get('accountId'),institutionId:form.get('institutionId')||null,color:card?.color||'#7962bf'};
      delete next.last4;
      if(![next.closingDay,next.dueDay].every(day=>Number.isInteger(day)&&day>=1&&day<=31))throw new Error('Informe fechamento e vencimento entre 1 e 31.');
      if(card&&(state.invoicePayments||[]).some(p=>p.cardId===card.id&&!p.cancelledAt)&&(next.closingDay!==card.closingDay||next.dueDay!==card.dueDay||next.accountId!==card.accountId))throw new Error('Este cartão tem pagamentos de fatura ativos. Alterar seu ciclo ou conta exige uma migração de histórico e está protegido nesta etapa.');
      if(card&&next.accountId!==card.accountId&&state.transactions.some(t=>t.cardId===card.id))throw new Error('O cartão já possui compras. Preserve a conta vinculada.');
      commit(s=>{if(card)s.cards[s.cards.findIndex(c=>c.id===id)]=next;else s.cards.push(next);},'Cartão salvo.');
      closeModal();
    }});
}
function renderAccounts(){return `${pageHeader('Todas as contas. <span>Uma visão.</span>','Organize saldos de abertura e movimentações que você registrar.',button('Adicionar conta','account','plus','btn primary'))}<div class="stats-row">${statCard('Saldo registrado',currency(state.accounts.reduce((s,a)=>s+accountBalance(state,a.id),0)),'wallet','Abertura + entradas − saídas em conta')}${statCard('Suas contas',state.accounts.length,'grid','Gestão manual neste navegador')}${statCard('Conexões bancárias','Não conectadas','repeat','Open Finance ainda não configurado')}</div><div class="accounts-grid">${state.accounts.map(a=>`<section class="panel account-card"><div class="card-heading">${institutionUI.badge(a)}${badge('MANUAL','soft')}</div><h3>${e(a.name)}</h3><p class="muted">${e(a.type)}</p><strong class="account-balance">${currency(accountBalance(state,a.id))}</strong><div class="account-card-footer">${button('Ver transações','account-transactions','repeat','btn',`data-id="${e(a.id)}"`)}${button('Editar','account','edit','btn',`data-id="${e(a.id)}"`)}</div></section>`).join('')}</div><div class="notice">${icon('wallet')} A conexão real com bancos depende de um provedor Open Finance e consentimento. Você já pode trabalhar com lançamentos manuais e importar extratos CSV.</div>`;}
function accountModal(id=''){const a=state.accounts.find(x=>x.id===id);openModal(a?'Editar conta':'Adicionar conta manual',`<form>${field('Nome da conta','name',a?.name||'','text','required maxlength="80"')}${institutionUI.picker(a,'wallet')}<div class="form-grid">${selectField('Tipo','type',['Conta corrente','Poupança','Dinheiro'].map(t=>`<option ${selected(a?.type,t)}>${t}</option>`).join(''))}${field('Saldo de abertura (R$)','openingBalance',a?String(a.openingBalance/100).replace('.',','):'0','text','required inputmode="decimal"')}</div><p class="hint">O saldo de abertura é anterior aos lançamentos registrados, para evitar dupla contagem. Esta conta não se conecta ao banco.</p>${formFooter()}</form>`,{onSubmit:f=>{const item={id:a?.id||uid(),name:f.get('name').trim(),type:f.get('type'),openingBalance:moneyInput(f.get('openingBalance')),institutionId:f.get('institutionId')||null,color:a?.color||'#7cbfda'};commit(s=>{if(a)s.accounts[s.accounts.findIndex(x=>x.id===id)]=item;else s.accounts.push(item);},'Conta salva.');closeModal();}});}
function renderChat(){return maxChat.render();}
function sendMessage(text){return maxChat.send(text);}
function renderInvestments(){const total=state.investments.reduce((s,x)=>s+x.amount,0);return `${pageHeader('Seu patrimônio, <span>por inteiro.</span>','Uma visão manual dos investimentos que você escolher acompanhar.',button('Registrar investimento','investment','plus','btn primary'))}<div class="investment-hero panel"><div><span class="eyebrow">PATRIMÔNIO REGISTRADO</span><strong>${currency(total)}</strong><p>${state.investments.length} posições · atualização manual</p></div><div class="investment-donut" aria-hidden="true">${icon('pie',42)}</div></div><div class="investments-grid">${state.investments.map(i=>`<section class="panel investment-card"><div class="card-heading">${icon('chart',24)}${badge(i.kind)}</div><h3>${e(i.name)}</h3><strong>${currency(i.amount)}</strong><div class="investment-footer"><span>${total?(i.amount/total*100).toFixed(1):0}% do patrimônio</span>${button('Atualizar','investment','edit','btn small',`data-id="${e(i.id)}"`)}</div></section>`).join('')}</div><div class="notice">${icon('pie')} Esta carteira é um registro manual. Rentabilidade, cotações em tempo real e negociação de produtos não estão integradas. A página web observada no Pierre direciona os investimentos para o aplicativo móvel.</div>`;}
function investmentModal(id=''){const x=state.investments.find(i=>i.id===id);openModal(x?'Atualizar investimento':'Registrar investimento',`<form>${field('Nome','name',x?.name||'','text','required maxlength="100"')}${selectField('Classe','kind',['Renda fixa','Renda variável','Fundos','Outros'].map(k=>`<option ${selected(x?.kind,k)}>${k}</option>`).join(''))}${field('Valor atual (R$)','amount',x?String(x.amount/100).replace('.',','):'','text','required inputmode="decimal"')}${formFooter()}</form>`,{onSubmit:f=>{const amount=moneyInput(f.get('amount'));if(amount<0)throw new Error('O valor não pode ser negativo.');const item={id:x?.id||uid(),name:f.get('name').trim(),kind:f.get('kind'),amount};commit(s=>{if(x)s.investments[s.investments.findIndex(i=>i.id===id)]=item;else s.investments.push(item);},'Investimento atualizado.');closeModal();}});}
function renderSettings(){return `${pageHeader('Seu espaço, <span>suas escolhas.</span>','Gerencie seu perfil e mantenha uma cópia dos seus registros.')}<install-app></install-app><div class="settings-grid">${notifications.settings()}<section class="panel settings-panel"><h2>Perfil</h2><form id="profile-form">${field('Como quer ser chamado?','name',state.profile.name,'text','required maxlength="80"')}${field('Salário mensal (R$)','salary',((state.profile.salary||0)/100).toFixed(2).replace('.',','),'text','inputmode="decimal"')}<p class="hint">Usado como sugestão ao programar seu salário. Não altera o saldo da conta.</p>${field('Meta mensal de economia (R$)','monthlyGoal',String(state.profile.monthlyGoal/100).replace('.',','),'text','required inputmode="decimal"')}${field('Limite de gastos mensal (R$)','monthlyBudget',((state.profile.monthlyBudget||0)/100).toFixed(2).replace('.',','),'text','required inputmode="decimal"')}<p class="hint">Avisos ao usar 80% e 100%. Zero desativa o limite geral; os orçamentos das categorias continuam independentes.</p>${selectField('Paleta de cores','palette',paletteOptions(state.profile.palette||'green'))}<div class="palette-preview" aria-hidden="true"><i></i><i></i><i></i></div><p class="hint">A cor transforma fundos, cartões, menus e o Max. Veja a prévia e salve seu perfil para manter a escolha.</p><button class="btn primary" type="submit">Salvar perfil</button></form></section><section class="panel settings-panel"><h2>Seus dados</h2><p>Seus registros são sincronizados com sua conta no Neon. Exporte um backup para manter uma cópia adicional.</p><div class="settings-buttons">${button('Histórico de alterações','activity','calendar')}${button('Gerenciar recorrências','recurrences','repeat')}${button('Exportar backup JSON','backup','download')}${button('Restaurar backup','restore','upload')}${button('Exportar transações do mês','export-csv','download')}${corruptedBackup?button('Recuperar arquivo anterior','recover-backup','download'):''}</div><p class="hint">O arquivo de backup pode conter informações pessoais. Guarde-o em um local seguro.</p></section><section class="panel settings-panel"><h2>Sobre esta versão</h2><p>Aplicação independente inspirada nos fluxos observados do Pierre Finance. Código próprio, dados iniciais fictícios e armazenamento no navegador.</p><ul class="feature-status"><li><span>Contas e transações manuais</span>${badge('Disponível','soft')}</li><li><span>Extratos CSV e backup JSON</span>${badge('Disponível','soft')}</li><li><span>Assistente e regras locais</span>${badge('Disponível','soft')}</li><li><span>Conversa com Gemini</span>${badge(maxChat.configured?'Disponível':'Não configurado',maxChat.configured?'soft':'')}</li><li><span>Open Finance e WhatsApp</span>${badge('Não configurado')}</li></ul></section><section class="panel settings-panel"><h2>Começar do seu jeito</h2><p>Comece com uma carteira vazia para registrar suas próprias finanças, ou restaure a demonstração. Exporte um backup antes de substituir os dados.</p><div class="settings-buttons">${button('Começar com dados vazios','reset-empty','','btn')}${button('Restaurar dados de exemplo','reset-demo','','btn')}</div></section></div>`;}
function download(name,text,mime){const blob=new Blob([text],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function backup(){download(`financas-do-max-${localDate()}.json`,JSON.stringify(state,null,2),'application/json');toast('Backup exportado.');}
function correctImportedModal(){
  const rows=state.transactions.filter(t=>canCorrectCsvType(state,t)&&t.date.startsWith(month)&&(!account||t.accountId===account));
  if(!rows.length)return toast('Nenhum lançamento importado que possa ser corrigido neste mês e conta.');
  openModal('Corrigir lançamentos importados',`<p>Selecione apenas os registros com o tipo errado em ${e(monthName(month))}${account?' · '+e(acct(account).name):' · todas as contas'}. A próxima etapa mostra o efeito no saldo antes de salvar.</p><form id="correct-imported-form">${selectField('Alterar selecionados para','newType','<option value="expense" selected>Despesa</option><option value="income">Receita</option>')}<button type="button" class="btn" id="select-imported-income">Selecionar receitas deste filtro</button><div class="correction-list">${rows.map(t=>`<label class="correction-item"><input type="checkbox" name="transactionId" value="${e(t.id)}"><span><strong>${e(t.description)}</strong><small>${dateLabel(t.date)} · ${e(acct(t.accountId).name)} · ${t.type==='income'?'Receita':'Despesa'} · ${currency(t.amount)}</small></span></label>`).join('')}</div><div id="correction-preview" role="status"></div>${formFooter('Revisar alteração')}</form>`,{wide:true});
  const form=$('#correct-imported-form'),submit=form.querySelector('[type="submit"]');let reviewed=false;
  const reset=()=>{reviewed=false;$('#correction-preview').innerHTML='';submit.textContent='Revisar alteração';};
  form.addEventListener('change',reset);
  $('#select-imported-income').addEventListener('click',()=>{for(const input of form.querySelectorAll('[name="transactionId"]'))input.checked=rows.find(t=>t.id===input.value).type==='income';reset();});
  form.addEventListener('submit',event=>{event.preventDefault();try{
    const data=new FormData(form),ids=data.getAll('transactionId'),type=data.get('newType');
    const plan=planCsvTypeCorrection(state,ids,type);
    if(!reviewed){$('#correction-preview').innerHTML=`<div class="notice">${plan.count} lançamento(s) passarão para ${type==='expense'?'Despesa':'Receita'}. Os mesmos registros serão corrigidos, sem criar cópias.</div>${plan.accounts.map(a=>`<p>${e(a.name)}: ${currency(a.before)} → <strong>${currency(a.after)}</strong></p>`).join('')}`;reviewed=true;submit.textContent='Confirmar correção';return;}
    commit(current=>{const fresh=planCsvTypeCorrection(current,ids,type);current.transactions=fresh.transactions;},`${plan.count} lançamento(s) importado(s) corrigido(s).`);closeModal();
  }catch(error){toast(error.message);}});
}
function importModal(){
  const destinationOptions=(state.cards.length?'<option value="" selected disabled>Escolha o destino</option>':'')+
    '<option value="account">Extrato da conta</option>'+options(state.cards.map(card=>({...card,id:'card:'+card.id,name:'Fatura · '+card.name})), '');
  openModal('Importar extrato CSV', `<p class="muted">O arquivo é analisado somente neste navegador. Revise os registros e o impacto no saldo antes de confirmar.</p>
    <div class="notice">Escolha a fatura do cartão para registrar compras no crédito. Use Extrato da conta para movimentações da conta.</div>
    <form id="import-form">
      ${selectField('Destino da importação','importCardId',destinationOptions,'required')}${selectField('Conta de destino','accountId',options(state.accounts,account||state.accounts[0]?.id))}${field('Mês de vencimento da fatura','invoiceMonth',month,'month')}${selectField('Tipo dos lançamentos','importType','<option value="expense" selected>Despesa</option><option value="income">Receita</option><option value="auto">Usar o tipo do arquivo</option>')}<p class="hint">Escolha Despesa para compras e contas a pagar, ou Receita para dinheiro que entrou. No modo automático, valores positivos sem tipo são receitas. Faturas de cartão aceitam apenas despesas.</p>
      <label class="file-drop">${icon('upload',28)}<strong>Escolha seu extrato CSV</strong><span>Até 5 MB / 10.000 registros · datas AAAA-MM-DD ou DD/MM/AAAA</span><input type="file" name="file" accept=".csv,text/csv" required aria-label="Arquivo CSV"></label>
      <p id="csv-import-error" class="form-error" role="alert"></p><div id="import-preview"></div>
      <div class="form-footer">${button('Baixar modelo','csv-template','download','btn','type="button"')}<button type="submit" class="btn primary">Analisar extrato</button></div>
    </form>`, {wide:true});
  $('#modal-root .modal').classList.add('csv-import-modal');
  const form=$('#import-form'), previewNode=$('#import-preview'), errorNode=$('#csv-import-error'), submit=form.querySelector('button[type="submit"]');
  const selectedCardId=()=>form.elements.importCardId.value.startsWith('card:')?form.elements.importCardId.value.slice(5):'';
  let records=null, preview=null, selected=new Set(), previewPage=0;
  const pageSize=50;const selectedValue=(value,match)=>value===match?'selected':'';
  const reset=()=>{records=null;preview=null;selected.clear();previewPage=0;previewNode.innerHTML='';errorNode.textContent='';submit.textContent='Analisar extrato';submit.disabled=false;};
  const summaryMarkup=()=> {
    const summary=csvSelectionSummary(preview,selected);
    const destination=preview.cardId
      ? 'Fatura · '+state.cards.find(card=>card.id===preview.cardId).name+' · '+monthName(preview.invoiceMonth)
      : 'Extrato da conta · '+acct(preview.accountId).name;
    submit.textContent=`Confirmar importação (${summary.count})`;submit.disabled=!summary.count;
    return `<p><strong>${e(destination)}</strong></p><div class="csv-summary" role="status"><span>Saldo registrado antes<strong>${currency(summary.balanceBefore)}</strong></span><span>Entradas selecionadas<strong>${currency(summary.income)}</strong></span><span>${preview.cardId?'Compras selecionadas':'Saídas selecionadas'}<strong>${currency(summary.expense)}</strong></span><span>Saldo após importação<strong>${currency(summary.balanceAfter)}</strong></span></div><p class="hint">${summary.count} registro(s) selecionado(s). ${records?.skippedPayments||0} pagamento(s) de fatura ignorado(s). ${preview.duplicateCount} possível(is) duplicata(s) ignorada(s).</p>`;
  };
  const renderSummary=()=>{$('#csv-summary').innerHTML=summaryMarkup();};
  const renderPreview=()=> {
    const pages=Math.ceil(preview.rows.length/pageSize), start=previewPage*pageSize;
    previewNode.innerHTML=`<div id="csv-summary">${summaryMarkup()}</div>
      <div class="csv-review-actions"><button type="button" class="btn small" data-csv-select="all">Selecionar novos</button><button type="button" class="btn small" data-csv-select="none">Limpar seleção</button></div>
      <div class="csv-table-scroll"><table class="csv-review-table"><caption>Prévia do extrato: nenhum lançamento foi salvo</caption><thead><tr><th scope="col">Importar</th><th scope="col">Data / descrição</th><th scope="col">Categoria</th><th scope="col">Tipo</th><th scope="col">Valor</th><th scope="col">Situação</th></tr></thead><tbody>${preview.rows.slice(start,start+pageSize).map(row=>`<tr class="${row.duplicate?'csv-duplicate':''}"><td><input type="checkbox" data-csv-row="${row.index}" aria-label="Importar registro ${row.index+1}: ${e(row.description)}" ${selected.has(row.index)?'checked':''} ${row.duplicate?'disabled':''}></td><td><small>${e(row.date.split('-').reverse().join('/'))}</small><strong>${e(row.description)}</strong></td><td data-label="Categoria"><select data-csv-category="${row.index}" aria-label="Categoria de ${e(row.description)}">${options(state.categories,row.categoryId)}</select></td><td data-label="Tipo"><select data-csv-type="${row.index}" aria-label="Tipo de ${e(row.description)}" ${preview.cardId?'disabled':''}><option value="expense" ${selectedValue(row.type,'expense')}>Despesa</option><option value="income" ${selectedValue(row.type,'income')}>Receita</option></select></td><td data-label="Valor">${row.type==='expense'?'−':'+'}${currency(row.amount)}</td><td>${row.duplicate?'Possível duplicata':'Novo'}</td></tr>`).join('')}</tbody></table></div>
      <div class="csv-review-actions"><button type="button" class="btn small" data-csv-page="-1" ${previewPage===0?'disabled':''}>Anterior</button><span class="hint">Página ${previewPage+1} de ${pages} · ${preview.rows.length} registros</span><button type="button" class="btn small" data-csv-page="1" ${previewPage===pages-1?'disabled':''}>Próxima</button></div>
      <p class="hint">Duplicatas usam data, descrição, valor, tipo e conta. Se uma repetição for legítima, cadastre-a manualmente. Revise o tipo e a categoria de cada lançamento antes de confirmar.</p>`;
  };
  form.addEventListener('change',ev=>{
    if(ev.target.matches('[name="importCardId"]')){const card=state.cards.find(c=>c.id===selectedCardId());if(card){form.elements.accountId.value=card.accountId;form.elements.importType.value='expense';}form.elements.importType.disabled=!!card;}
    if(ev.target.matches('[name="file"],[name="accountId"],[name="importCardId"],[name="invoiceMonth"],[name="importType"]'))reset();
    if(ev.target.matches('[data-csv-category]')){const index=Number(ev.target.dataset.csvCategory),category=state.categories.find(c=>c.id===ev.target.value);if(category){records[index].categoryName=category.name;preview.rows[index].categoryId=category.id;}}
    if(ev.target.matches('[data-csv-type]')){const index=Number(ev.target.dataset.csvType);records[index].type=ev.target.value;preview=previewCsvImport(state,records,form.elements.accountId.value,selectedCardId(),form.elements.invoiceMonth.value);selected=new Set([...selected].filter(i=>!preview.rows[i].duplicate));renderPreview();}
    if(ev.target.matches('[data-csv-row]')){
      const index=Number(ev.target.dataset.csvRow);
      if(ev.target.checked)selected.add(index);else selected.delete(index);
      renderSummary();
    }
  });
  form.addEventListener('click',ev=>{
    const choose=ev.target.closest('[data-csv-select]'), move=ev.target.closest('[data-csv-page]');
    if(choose&&preview){selected=choose.dataset.csvSelect==='all'?new Set(preview.rows.filter(row=>!row.duplicate).map(row=>row.index)):new Set();renderPreview();}
    if(move&&preview){previewPage=Math.max(0,Math.min(Math.ceil(preview.rows.length/pageSize)-1,previewPage+Number(move.dataset.csvPage)));renderPreview();}
  });
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();errorNode.textContent='';submit.disabled=true;
    try{
      if(!form.elements.importCardId.value)throw new Error('Escolha onde importar o CSV.');
      const accountId=form.elements.accountId.value, cardId=selectedCardId(), invoiceMonth=form.elements.invoiceMonth.value;
      if(!preview){
        const file=form.elements.file.files[0];
        if(!file)throw new Error('Selecione um arquivo CSV.');
        if(file.size>5_000_000)throw new Error('O arquivo deve ter até 5 MB.');
        for(const name of ['file','accountId','importCardId','invoiceMonth','importType'])form.elements[name].disabled=true;
        const parsed=applyCsvType(parseCSV(await file.text(),{cardInvoice:!!cardId}),cardId?'expense':form.elements.importType.value);
        if(!form.isConnected)return;
        const next=previewCsvImport(state,parsed,accountId,cardId,invoiceMonth);
        records=parsed;preview=next;selected=new Set(next.rows.filter(row=>!row.duplicate).map(row=>row.index));
        renderPreview();$('#csv-summary')?.scrollIntoView({block:'nearest'});
      }else{
        let result;
        commit(current=>{result=buildCsvImport(current,records,accountId,selected,uid,cardId,invoiceMonth);current.transactions.push(...result.transactions);});
        closeModal();toast(`${result.transactions.length} registros importados. ${result.duplicateCount} possíveis duplicatas ignoradas.`);
      }
    }catch(error){errorNode.textContent=error.message;}
    finally{for(const name of ['file','accountId','importCardId','invoiceMonth'])form.elements[name].disabled=false;form.elements.importType.disabled=!!selectedCardId();submit.disabled=preview?!csvSelectionSummary(preview,selected).count:false;}
  });
}
function restoreModal(){openModal('Restaurar backup',`<p class="muted">O backup substituirá os dados atuais após a validação. Exporte uma cópia primeiro.</p><form id="restore-form"><label class="file-drop">${icon('upload',28)}<strong>Selecione um backup JSON</strong><input type="file" name="file" accept=".json,application/json" required aria-label="Backup JSON"></label><div id="restore-error" role="alert" class="form-error"></div><label class="check-label"><input type="checkbox" name="confirm" required> Confirmo a substituição dos dados deste navegador.</label>${formFooter('Restaurar')}</form>`);const form=$('#restore-form');form.addEventListener('submit',async ev=>{ev.preventDefault();try{const file=form.elements.file.files[0];if(!file||file.size>10_000_000)throw new Error('Selecione um backup de até 10 MB.');const restored=validateState(JSON.parse(await file.text()));await persistState(restored).catch(error=>{remoteReady=false;throw error;});state=restored;corruptedBackup=null;account='';overviewCardId='';summaryAccount='';summaryCategory='';filters={search:'',category:'',kind:'',hidden:false,sort:'newest',day:'',status:'',basis:'consumption'};closeModal();render();toast('Backup restaurado.');}catch(err){$('#restore-error').textContent=err.message;}});}
function resetModal(demo){openModal(demo?'Restaurar demonstração':'Começar com dados vazios',`<p class="muted">Você está prestes a substituir todos os registros desta aplicação. Exporte um backup para manter uma cópia.</p>${button('Exportar backup antes','backup','download')}<form><label class="check-label"><input type="checkbox" name="confirm" required> Confirmo que posso substituir os dados atuais.</label>${formFooter('Substituir dados')}</form>`,{onSubmit:async()=>{const next=seedState();if(!demo){next.accounts=[{id:'wallet',name:'Minha carteira',type:'Dinheiro',color:'#72dbb0',openingBalance:0}];for(const key of ['transactions','cards','installments','subscriptions','investments','messages'])next[key]=[];next.profile=state.profile;next.agents=[];}await persistState(next).catch(error=>{remoteReady=false;throw error;});state=next;account='';overviewCardId='';summaryAccount='';summaryCategory='';filters={search:'',category:'',kind:'',hidden:false,sort:'newest',day:''};corruptedBackup=null;closeModal();go('overview');toast('Seu espaço foi atualizado.');}});}
function render(){applyPalette(state.profile.palette||'green',state.profile.surface||'dark',state.profile.customColor||'');document.body.classList.toggle('menu-is-open',menuOpen);const renderers={overview:renderOverview,transactions:renderTransactions,installments:renderInstallments,subscriptions:renderSubscriptions,recurrences:recurrenceUI.renderRecurrences,activity:operationsUI.renderActivity,categories:renderCategories,cards:renderCards,accounts:renderAccounts,chat:renderChat,investments:renderInvestments,settings:renderSettings,notifications:()=>pageHeader('Seus avisos financeiros','Contas, faturas e orçamento que merecem atenção.')+notifications.alerts()};$('#app').innerHTML=shell(renderers[section()]());document.title=`${({chat:'Assistente',settings:'Configurações',accounts:'Contas',activity:'Histórico',investments:'Investimentos',notifications:'Avisos'}[section()]||sections.find(x=>x[0]===section())?.[1])} · Finanças do Max`;bindControls();maxChat.bind();}
function bindControls(){notifications.bind();applyInputMasks($('#app'));sortSelectOptions($('#app'));mountThemeControls();recurrenceUI.bindControls();const changes={'summary-account':v=>{summaryAccount=v;overviewCardId='';},'summary-category':v=>{summaryCategory=v;},'overview-card':v=>{overviewCardId=v;},'report-basis':v=>{reportBasis=v;},'transaction-card-filter':v=>{filters.cardId=v;filters.summary=false;filters.hiddenOnly=false;filters.basis='consumption';page=1;},'transaction-basis':v=>{filters.basis=v;page=1;},'status-filter':v=>{filters.status=v;page=1;},'month-filter':v=>{month=v;filters.hiddenOnly=false;filters.day='';page=1;},'account-filter':v=>{account=v;filters.cardId='';page=1;},'category-filter':v=>{filters.category=v;page=1;},'type-filter':v=>{filters.kind=v;page=1;},'sort-filter':v=>{filters.sort=v;page=1;}};for(const [id,fn]of Object.entries(changes))$('#'+id)?.addEventListener('change',ev=>{if(id==='month-filter'&&!/^\d{4}-\d{2}$/.test(ev.target.value))return;fn(ev.target.value);render();});$('#hidden-filter')?.addEventListener('change',ev=>{filters.hidden=ev.target.checked;if(!filters.hidden)filters.hiddenOnly=false;page=1;render();});$('#search')?.addEventListener('input',ev=>{filters.search=ev.target.value;page=1;const pos=ev.target.selectionStart;render();$('#search')?.focus();$('#search')?.setSelectionRange(pos,pos);});$('#chat-form')?.addEventListener('submit',ev=>{ev.preventDefault();try{sendMessage(new FormData(ev.target).get('message'));}catch(err){toast(err.message);}});$('#chat-input')?.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();$('#chat-form').requestSubmit();}});$('#profile-form')?.addEventListener('submit',ev=>{ev.preventDefault();try{const f=new FormData(ev.target),goal=moneyInput(f.get('monthlyGoal')),salary=moneyInput(f.get('salary')||'0');if(salary<0)throw new Error('O salário não pode ser negativo.');if(goal<0)throw new Error('A meta não pode ser negativa.');commit(s=>{s.profile.name=f.get('name').trim();s.profile.monthlyGoal=goal;s.profile.salary=salary;const budget=moneyInput(f.get('monthlyBudget')||'0');if(budget<0)throw new Error('O limite mensal não pode ser negativo.');s.profile.monthlyBudget=budget;s.profile.palette=f.get('palette');s.profile.surface=f.get('surface')||'dark';s.profile.customColor=f.get('customColor')||'#79e6b4';},'Perfil salvo.');}catch(err){toast(err.message);}});}
document.addEventListener('click',ev=>{const target=ev.target.closest('[data-action]');if(!target||target.disabled)return;const {action,id,day,question}=target.dataset;if(menuOpen&&target.closest('.sidebar')){menuOpen=false;$('.sidebar')?.classList.remove('mobile-open');$('.sidebar-scrim')?.remove();document.body.classList.remove('menu-is-open');$('.mobile-menu')?.setAttribute('aria-expanded','false');}try{const actions={recurrence:()=>recurrenceUI.recurrenceModal(id),'generate-recurrences':()=>recurrenceUI.generationModal(),'toggle-recurrence':()=>recurrenceUI.toggleRecurrence(id),'subscription-recurrence':()=>recurrenceUI.recurrenceModal('',id),'recurrence-transactions':()=>showTransactionsForRule(id),'clear-recurrence-filter':()=>{filters.recurrenceId='';render();},'subscription-calendar-mode':()=>subscriptionCalendarUI.selectMode(target.dataset.mode),'subscription-calendar-day':()=>subscriptionCalendarUI.selectDay(target.dataset.date),'subscription-calendar-prev':()=>subscriptionCalendarUI.move(-1),'subscription-calendar-next':()=>subscriptionCalendarUI.move(1),'transaction-settle':()=>operationsUI.operationModal(id,'settle'),'transaction-cancel':()=>operationsUI.operationModal(id,'cancel'),'transaction-restore':()=>operationsUI.operationModal(id,'restore'),'transaction-subscription':()=>operationsUI.markSubscriptionModal(id),'audit-prev':()=>operationsUI.moveHistory(-1),'audit-next':()=>operationsUI.moveHistory(1),transactions:()=>go('transactions'),'clear-summary':()=>{summaryAccount='';overviewCardId='';summaryCategory='';render();},'summary-transactions':()=>{account=summaryAccount;filters={search:'',category:id,kind:'expense',hidden:false,sort:'newest',day:'',status:'',basis:'consumption',summary:true,cardId:overviewCardId};page=1;go('transactions');},'show-hidden':()=>{account=section()==='overview'?(state.cards.find(c=>c.id===overviewCardId)?.accountId||summaryAccount):account;filters={search:'',category:'',kind:'',hidden:true,hiddenOnly:true,sort:'newest',day:'',status:'',basis:'consumption'};page=1;go('transactions');},'plan-invoice':()=>{month=target.dataset.month;go('cards');},'clear-card-filter':()=>{filters.cardId='';filters.summary=false;filters.basis='consumption';render();},'clear-special-view':()=>{filters.summary=false;filters.hiddenOnly=false;filters.cardId='';filters.hidden=false;render();},'invoice-details':()=>invoiceDetails(id,target.dataset.month),'invoice-pay':()=>invoicePaymentModal(id,target.dataset.month),'invoice-payment-edit':()=>{const payment=state.invoicePayments.find(item=>item.id===id);invoicePaymentModal(payment.cardId,payment.month,payment);},'invoice-payment-cancel':()=>invoicePaymentCancelModal(id),'card-purchase':()=>transactionModal('',id),transaction:()=>transactionModal(id),installment:()=>installmentModal(id),subscription:()=>subscriptionModal(id),category:()=>categoryModal(id),card:()=>cardModal(id),account:()=>accountModal(id),'correct-imported':()=>correctImportedModal(),investment:()=>investmentModal(id),'close-modal':closeModal,'close-menu':()=>{menuOpen=false;render();},menu:()=>{menuOpen=!menuOpen;render();},'prev-month':()=>{filters.hiddenOnly=false;month=shiftMonth(month,-1);page=1;filters.day='';render();},'next-month':()=>{filters.hiddenOnly=false;month=shiftMonth(month,1);page=1;filters.day='';render();},'category-filter':()=>goCategory(id),'day-filter':()=>{filters.cardId=overviewCardId;filters.basis=reportBasis;filters.day=day;filters.category='';page=1;go('transactions');},'clear-day':()=>{filters.day='';render();},'prev-page':()=>{page--;render();},'next-page':()=>{page++;render();},'hide-transaction':()=>visibilityModal(id),'pay-installment':()=>commit(s=>{const i=s.installments.find(x=>x.id===id);i.paid=Math.min(i.count,i.paid+1);},'Parcela marcada como paga. Nenhum dinheiro foi movimentado.'),'toggle-subscription':()=>recurrenceUI.toggleSubscription(id),alerts:()=>go('notifications'),ask:()=>sendMessage(question),import:importModal,backup,restore:restoreModal,'reset-empty':()=>resetModal(false),'reset-demo':()=>resetModal(true),'export-csv':()=>download(`transacoes-${month}.csv`,csvExport(section()==='transactions'?filteredTransactions():monthlyRows(state,month,{account}),state),'text/csv;charset=utf-8'),'csv-template':()=>download('modelo-extrato.csv','\uFEFFdata;descricao;valor;tipo;categoria\r\n'+localDate()+';Mercado da semana;-125,50;despesa;Supermercado\r\n'+localDate()+';Pagamento recebido;1500,00;receita;Outros','text/csv;charset=utf-8'),'recover-backup':()=>download('armazenamento-anterior.json',corruptedBackup||'','application/json'),'account-transactions':()=>{account=id;filters={search:'',category:'',kind:'',hidden:false,sort:'newest',day:'',status:'',basis:'consumption'};page=1;go('transactions');},'card-transactions':()=>invoiceDetails(id)};if(actions[action])actions[action]();else if(routes.has(action))go(action);}catch(err){toast(err.message);}});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&menuOpen){menuOpen=false;render();$('.mobile-menu')?.focus();return;}const modal=$('#modal-root .modal');if(!modal)return;if(ev.key==='Escape'){ev.preventDefault();closeModal();}if(ev.key==='Tab'){const focusable=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type=hidden]),textarea,select,a[href],summary')].filter(x=>!x.closest('[hidden]')&&x.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}}});
window.addEventListener('hashchange',()=>{if($('#modal-root .modal'))closeModal();menuOpen=false;render();window.scrollTo(0,0);});
window.addEventListener('storage',ev=>{if(ev.key!==STORE_KEY)return;try{if(ev.newValue){state=validateState(JSON.parse(ev.newValue));closeModal();render();toast('Dados atualizados em outra aba.');}}catch{toast('A atualização de outra aba contém dados inválidos.');}});
function showTransactionsForRule(id){
  const latest=state.transactions.filter(item=>item.recurringTransactionId===id).sort((a,b)=>b.date.localeCompare(a.date))[0];
  if(latest)month=latest.date.slice(0,7);account='';page=1;
  filters={search:'',category:'',kind:'',hidden:false,sort:'newest',day:'',status:'',basis:'consumption',recurrenceId:id};go('transactions');
}
const financeContext={getState:()=>state,getMonth:()=>month,setMonth:value=>{month=value;},getAccount:()=>account,commit,e,currency,localDate,dateLabel,openModal,closeModal,field,selectField,options,selected,formFooter,button,badge,pageHeader,statCard,empty,acct,render,refresh:render,go,toast,$,uid,periodControl,showTransactionsForRule};
const recurrenceUI=createRecurrenceUI(financeContext);
const subscriptionCalendarUI=createSubscriptionCalendarUI(financeContext);
const operationsUI=createFinancialOperationsUI(financeContext);
const maxChat=createMaxChat({getState:()=>state,getMonth:()=>month,setMonth:value=>{month=value;},commit,remote,onSaved:async snapshot=>{const next=validateState(snapshot.state);remote.acceptSnapshot(snapshot);state=next;localStorage.setItem(STORE_KEY,JSON.stringify(state));},render,e,icon,$,fetcher:sessionFetch});
const notifications=createNotificationUI({getState:()=>state,e,toast,refresh:render,fetcher:sessionFetch});
await Promise.all([maxChat.init(),notifications.init()]);
alerts=evaluateAgents(state,month);
render();
