import {invoiceFor, creditInstallmentPlans, validMonth, validCivilDate} from './billing.mjs';
import {validateRecurrences} from './recurrences.mjs';
import {validateAudit} from './audit.mjs';
export const STORE_KEY = 'financas-do-max:v1';
export const currency = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((n || 0) / 100);
export const uid = () => globalThis.crypto.randomUUID();
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const monthName = m => new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', {month:'long',year:'numeric'});
export function shiftMonth(m, delta) { const d = new Date(`${m}-15T12:00:00`); d.setMonth(d.getMonth()+delta); return localDate(d).slice(0,7); }
export function moneyInput(value) {
  let text = String(value).trim().replace(/R\$\s?/g,'').replace(/\s/g,'');
  if (text.includes(',')) text = text.replace(/\./g,'').replace(',','.');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Informe um valor com até duas casas decimais.');
  const cents = Math.round(Number(text)*100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents)>100_000_000_000) throw new Error('O valor está fora do limite permitido.');
  return cents;
}
export const normalize = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const byDate = (a,b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description);
export function monthlyRows(state, month, {account='',category='',kind='',search='',hidden=false,basis='consumption',includeCancelled=false}={}) {
  return state.transactions.filter(t => {
    if(t.status==='cancelled'&&!includeCancelled)return false;
    if(basis==='cash'&&(t.cardId||t.status&&t.status!=='completed'))return false;
    const date=basis==='cash'?(t.settledAt||t.date):t.date;
    return date.startsWith(month) && (hidden || !t.hidden) && (!account || t.accountId===account || t.toAccountId===account) && (!category || t.categoryId===category) && (!kind || t.type===kind) && (!search || normalize(t.description).includes(normalize(search)));
  }).map(t=>basis==='cash'?{...t,effectiveDate:t.settledAt||t.date}:t).sort((a,b)=>(b.effectiveDate||b.date).localeCompare(a.effectiveDate||a.date)||byDate(a,b));
}
export function totals(rows,{basis='consumption'}={}) {
  const eligible=rows.filter(t=>t.status!=='cancelled'&&(basis==='cash'?!t.cardId&&(!t.status||t.status==='completed'):!t.invoicePaymentId));
  const income = eligible.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = eligible.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  return {income,expense,balance:income-expense,count:rows.length};
}
export function accountBalance(state,id) {
  return state.transactions.filter(t=>!t.cardId&&(!t.status||t.status==='completed')).reduce((s,t)=> {
    if (t.toAccountId===id && t.type==='transfer') s+=t.amount;
    if (t.accountId===id) s+=t.type==='income'?t.amount:-t.amount;
    return s;
  }, state.accounts.find(a=>a.id===id)?.openingBalance || 0);
}
export function categoryTotals(state,month,account='',{basis='consumption'}={}) {
  const rows=monthlyRows(state,month,{account,basis}).filter(t=>basis==='cash'||!t.invoicePaymentId);
  return state.categories.map(c=>({...c,total:rows.filter(t=>t.categoryId===c.id&&t.type==='expense').reduce((s,t)=>s+t.amount,0)})).sort((a,b)=>b.total-a.total);
}
export function dailyTotals(rows,month) {
  const days=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
  return Array.from({length:days},(_,i)=>rows.filter(t=>t.type==='expense'&&Number((t.effectiveDate||t.date).slice(8))===i+1).reduce((s,t)=>s+t.amount,0));
}
export function financialReport(state,month,{basis='cash',account='',cardId=''}={}) {
  const card=state.cards.find(c=>c.id===cardId);
  const invoice=card?invoiceFor(state,card,month):null;
  const rows=invoice?invoice.items.map(item=>({
    ...state.transactions.find(t=>t.id===item.transactionId),
    amount:item.amount,effectiveDate:invoice.dueDate,
    installmentIndex:item.index,installmentTotal:item.count,
  })):monthlyRows(state,month,{account,basis});
  const reportBasis=invoice?'consumption':basis;
  const summary=totals(rows,{basis:reportBasis});
  const categories=state.categories.map(category=>({...category,total:rows.filter(t=>t.type==='expense'&&t.status!=='cancelled'&&t.categoryId===category.id&&(reportBasis==='cash'||!t.invoicePaymentId)).reduce((sum,t)=>sum+t.amount,0)})).sort((a,b)=>b.total-a.total);
  return {rows,summary,categories,invoice,basis:reportBasis};
}
export function pendingExpenses(state,month,account='') {
  const transactions=state.transactions.filter(t=>t.status==='pending'&&!t.cardId&&t.type==='expense'&&(t.dueDate||t.date).startsWith(month)&&(!account||t.accountId===account));
  const invoices=state.cards.filter(c=>!account||c.accountId===account).map(card=>invoiceFor(state,card,month)).filter(invoice=>!invoice.payment);
  return transactions.reduce((sum,t)=>sum+t.amount,0)+invoices.reduce((sum,invoice)=>sum+invoice.total,0);
}
export function cumulative(values) { let s=0;return values.map(n=>(s+=n)); }
export function installmentSummary(items) {
  const active=items.filter(i=>!i.hidden&&i.paid<i.count);
  const total=active.reduce((s,i)=>s+(i.totalAmount??i.amount*i.count),0);
  const paid=active.reduce((s,i)=>s+(i.paidAmount??i.amount*i.paid),0);
  return {total,paid,remaining:total-paid,monthly:active.reduce((s,i)=>s+i.amount,0),count:active.length};
}
export function findDuplicates(rows) {
  const seen=new Map(),result=[];
  for (const t of rows.filter(t=>t.type==='expense'&&!t.hidden&&!t.invoicePaymentId&&t.status!=='cancelled')) {
    const key=[normalize(t.description),t.amount,t.date,t.accountId,t.cardId||''].join('|');
    if(seen.has(key)) result.push(t); else seen.set(key,t);
  } return result;
}
export function evaluateAgents(state,month) {
  const rows=monthlyRows(state,month), cats=categoryTotals(state,month);
  return state.agents.filter(a=>a.active).map(a=>{
    if(a.kind==='duplicates') {const d=findDuplicates(rows);return {agentId:a.id,name:a.name,severity:d.length?'warning':'ok',text:d.length?`${d.length} possível(is) cobrança(s) duplicada(s). Confira antes de tomar uma decisão.`:'Nenhuma cobrança duplicada encontrada neste mês.'};}
    if(a.kind==='budget') {const selected=a.categoryId?cats.filter(c=>c.id===a.categoryId):cats;const over=selected.filter(c=>c.budget>0&&c.total>c.budget);const all=totals(rows).expense;return {agentId:a.id,name:a.name,severity:over.length||(a.limit&&all>a.limit)?'warning':'ok',text:over.length?over.map(c=>`${c.name}: ${currency(c.total-c.budget)} acima do orçamento.`).join(' '):a.limit&&all>a.limit?`Seus gastos superaram o limite em ${currency(all-a.limit)}.`:'Seus gastos estão dentro dos limites configurados.'};}
    const t=totals(rows);return {agentId:a.id,name:a.name,severity:'info',text:`${monthName(month)}: ${currency(t.income)} em receitas, ${currency(t.expense)} em despesas e saldo de ${currency(t.balance)}.`};
  });
}
export function assistantReply(state,month,input) {
  const query=normalize(input), rows=monthlyRows(state,month), t=totals(rows), cats=categoryTotals(state,month);
  if(/duplicad/.test(query)) {const d=findDuplicates(rows);return d.length?`Encontrei ${d.length} possível(is) duplicidade(s): ${d.map(x=>`${x.description} (${currency(x.amount)})`).join(', ')}. São indícios; confira os lançamentos antes de excluir.`:'Não encontrei lançamentos com a mesma descrição, valor, data e conta neste mês.';}
  if(/assinatur|recorrent/.test(query)) {const s=state.subscriptions.filter(x=>x.active);const amount=s.reduce((n,x)=>n+(x.cycle==='year'?Math.round(x.amount/12):x.amount),0);return `Você tem ${s.length} assinatura(s) ativa(s), equivalentes a ${currency(amount)} por mês e ${currency(amount*12)} por ano. ${s.map(x=>`${x.name}: ${currency(x.amount)}/${x.cycle==='year'?'ano':'mês'}`).join('; ')}.`;}
  if(/parcel/.test(query)) {const s=installmentSummary([...state.installments,...creditInstallmentPlans(state)]);return `Há ${s.count} compra(s) parcelada(s) em andamento, com ${currency(s.monthly)} de compromisso mensal e ${currency(s.remaining)} ainda a pagar. Esses valores não são somados novamente às despesas do extrato.`;}
  if(/compar|mes passado|anterior/.test(query)){const prev=totals(monthlyRows(state,shiftMonth(month,-1)));const delta=t.expense-prev.expense;return `Em ${monthName(month)}, as despesas foram ${currency(t.expense)}. No mês anterior, ${currency(prev.expense)}: ${currency(Math.abs(delta))} ${delta>=0?'a mais':'a menos'}.`;}
  if(/saldo|receita|recebi|entrou/.test(query))return `No período de ${monthName(month)}, entraram ${currency(t.income)} e saíram ${currency(t.expense)}. O resultado é ${currency(t.balance)}. Nas suas contas, o saldo registrado é ${currency(state.accounts.reduce((n,a)=>n+accountBalance(state,a.id),0))}.`;
  const category=cats.find(c=>query.includes(normalize(c.name)) || c.keywords.some(k=>query.includes(k)));
  if(category) return `${category.name}: ${currency(category.total)} em despesas em ${monthName(month)}.${category.budget?` Seu orçamento é ${currency(category.budget)}; ${category.total>category.budget?'ultrapassou em '+currency(category.total-category.budget):'restam '+currency(category.budget-category.total)}.`:''}`;
  if(/econom|limite|orcamento/.test(query))return `As maiores categorias são ${cats.filter(c=>c.total>0).slice(0,3).map(c=>`${c.name} (${currency(c.total)})`).join(', ')||'ainda não registradas'}. Defina limites em Categorias para acompanhar seus gastos. Uma redução hipotética de 10% nas despesas deste mês representa ${currency(Math.round(t.expense*.1))}.`;
  if(/gastei|gastos|resumo|analise|despesas/.test(query))return `Em ${monthName(month)}, você registrou ${rows.length} transações: ${currency(t.expense)} em despesas e ${currency(t.income)} em receitas. Maior categoria: ${cats[0]?.total?`${cats[0].name}, com ${currency(cats[0].total)}`:'nenhuma ainda'}. Posso detalhar categorias, comparar meses, encontrar duplicidades e resumir assinaturas.`;
  return 'Sou seu assistente local: calculo respostas a partir dos dados registrados aqui. Pergunte “Quanto gastei este mês?”, “Compare com o mês passado”, “Quais são minhas assinaturas?” ou “Há cobranças duplicadas?”. Não consulto a internet nem utilizo um modelo de IA nesta versão.';
}
export function parseCSV(text) {
  if(text.length>5_000_000)throw new Error('O CSV deve ter até 5 MB.');
  text=text.replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/)[0];const delimiter=first.includes(';')?';':',';
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw new Error('CSV inválido: aspas não foram fechadas.');
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  const head=rows.shift()?.map(normalize);
  const col=(...names)=>head?.findIndex(h=>names.includes(h))??-1;
  const date=col('data','date'),description=col('descricao','description','titulo'),amount=col('valor','amount'),type=col('tipo','type'),category=col('categoria','category');
  if([date,description,amount].some(i=>i<0))throw new Error('O CSV precisa das colunas data, descricao e valor.');
  if(rows.length>10000)throw new Error('Importe até 10.000 linhas por arquivo.');
  return rows.filter(r=>r.some(x=>x.trim())).map((r,i)=>{
    let d=r[date].trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(d))d=d.split('/').reverse().join('-');
    if(!validDate(d))throw new Error(`Data inválida na linha ${i+2}.`);
    const value=moneyInput(r[amount]); if(!value)throw new Error(`Valor zero na linha ${i+2}.`);
    const kind=normalize(r[type]||'');
    if(['transferencia','transfer','pagamento_fatura'].includes(kind))throw new Error(`Transferência ou pagamento de fatura na linha ${i+2}: cadastre pela tela correspondente ou restaure um backup JSON.`);
    if(kind&&!['receita','income','credito','despesa','expense','debito'].includes(kind))throw new Error(`Tipo desconhecido na linha ${i+2}. Use receita ou despesa.`);
    const inferred=['receita','income','credito'].includes(kind)?'income':['despesa','expense','debito'].includes(kind)?'expense':value<0?'expense':'income';
    return {date:d,description:r[description].trim().slice(0,240),amount:Math.abs(value),type:inferred,categoryName:category>=0?r[category].trim():''};
  });
}
export function csvExport(rows,state) {
  const safe=value=> {let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFFdata;descricao;valor;tipo;categoria;conta\r\n'+rows.map(t=>[t.date,t.description,(t.amount/100).toFixed(2).replace('.',','),t.invoicePaymentId?'pagamento_fatura':t.type==='income'?'receita':t.type==='transfer'?'transferencia':'despesa',state.categories.find(c=>c.id===t.categoryId)?.name||'',state.accounts.find(a=>a.id===t.accountId)?.name||''].map(safe).join(';')).join('\r\n');
}
export function validDate(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const date=new Date(`${d}T12:00:00`);return !Number.isNaN(date.getTime())&&localDate(date)===d;}
export function validateState(s) {
  if(!s || s.version!==1)throw new Error('Backup incompatível. Use um arquivo exportado pelo Finanças do Max.');
  for(const field of ['accounts','categories','transactions','cards','installments','subscriptions','agents','messages','investments'])if(!Array.isArray(s[field])||s[field].length>20000)throw new Error(`Lista inválida: ${field}.`);
  if(s.invoicePayments!==undefined&&(!Array.isArray(s.invoicePayments)||s.invoicePayments.length>20000))throw new Error('Lista de pagamentos inválida.');
  const text=(v,max=240)=>typeof v==='string'&&v.length<=max;
  const integer=v=>Number.isSafeInteger(v)&&Math.abs(v)<=100_000_000_000;
  for(const field of ['accounts','categories','transactions','cards','installments','subscriptions','agents','investments']){const ids=new Set();for(const x of s[field]){if(!x||!text(x.id,100)||ids.has(x.id))throw new Error(`Identificador inválido em ${field}.`);ids.add(x.id);}}
  for(const a of s.accounts)if(!text(a.name,80)||!integer(a.openingBalance)||!text(a.color,30))throw new Error('Conta inválida.');
  for(const c of s.categories)if(!text(c.name,80)||!text(c.icon,12)||!integer(c.budget)||c.budget<0||!Array.isArray(c.keywords)||c.keywords.some(k=>!text(k,100)))throw new Error('Categoria inválida.');
  for(const t of s.transactions){if(!text(t.description)||!validDate(t.date)||!integer(t.amount)||t.amount<=0||!['income','expense','transfer'].includes(t.type)||!s.accounts.some(a=>a.id===t.accountId)||t.type==='transfer'&&(!s.accounts.some(a=>a.id===t.toAccountId)||t.accountId===t.toAccountId)||t.cardId&&!s.cards.some(c=>c.id===t.cardId)||t.categoryId&&!s.categories.some(c=>c.id===t.categoryId))throw new Error('Transação inválida no backup.');}
  for(const t of s.transactions){
    if(t.status!==undefined&&!['pending','completed','cancelled'].includes(t.status)||t.settledAt&&!validCivilDate(t.settledAt)||t.dueDate&&!validCivilDate(t.dueDate))throw new Error('Situação ou liquidação inválida no lançamento.');
    if(t.installmentCount!==undefined&&(!t.cardId||!Number.isInteger(t.installmentCount)||t.installmentCount<1||t.installmentCount>600||t.installmentCount>t.amount))throw new Error('Parcelamento de cartão inválido.');
    if(t.cardId&&(t.type!=='expense'||s.cards.find(c=>c.id===t.cardId)?.accountId!==t.accountId||t.invoicePaymentId))throw new Error('Vínculo do cartão inválido.');
    if(t.invoicePaymentId&&!(s.invoicePayments||[]).some(p=>p.id===t.invoicePaymentId&&p.id===t.id))throw new Error('Pagamento de fatura sem registro vinculado.');
    if(t.isSubscription!==undefined&&typeof t.isSubscription!=='boolean'||t.subscriptionId!==undefined&&(!s.subscriptions.some(x=>x.id===t.subscriptionId)||t.type!=='expense'||t.invoicePaymentId))throw new Error('Vínculo de assinatura inválido.');
  }
  for(const c of s.cards)if(!text(c.name,80)||!/^\d{4}$/.test(c.last4)||!integer(c.limit)||c.limit<0||!s.accounts.some(a=>a.id===c.accountId)||!Number.isInteger(c.dueDay)||c.dueDay<1||c.dueDay>31)throw new Error('Cartão inválido.');
  for(const c of s.cards)if(c.closingDay!=null&&(!Number.isInteger(c.closingDay)||c.closingDay<1||c.closingDay>31))throw new Error('Dia de fechamento inválido.');
  for(const i of s.installments)if(!text(i.name,100)||!integer(i.amount)||i.amount<=0||!Number.isInteger(i.count)||i.count<1||i.count>600||!Number.isInteger(i.paid)||i.paid<0||i.paid>i.count)throw new Error('Parcelamento inválido.');
  for(const x of s.subscriptions)if(!text(x.name,100)||!integer(x.amount)||x.amount<=0||!['month','year'].includes(x.cycle)||!validDate(x.nextDate))throw new Error('Assinatura inválida.');
  for(const a of s.agents)if(!text(a.name,100)||!text(a.description,600)||!['summary','budget','duplicates'].includes(a.kind)||!['daily','weekly','monthly'].includes(a.frequency)||!integer(a.limit)||a.limit<0)throw new Error('Agente inválido.');
  for(const i of s.investments)if(!text(i.name,100)||!text(i.kind,80)||!integer(i.amount)||i.amount<0)throw new Error('Investimento inválido.');
  for(const m of s.messages)if(!['user','assistant'].includes(m.role)||!text(m.content,10000)||!text(m.id,100)||m.source!==undefined&&!['local','gemini'].includes(m.source)||m.month!==undefined&&!validMonth(m.month)||m.notice!=null&&!text(m.notice,500))throw new Error('Mensagem inválida.');
  if(!s.profile||!text(s.profile.name,80)||!integer(s.profile.monthlyGoal)||s.profile.monthlyGoal<0)throw new Error('Perfil inválido.');
  if(s.profile.salary!==undefined&&(!integer(s.profile.salary)||s.profile.salary<0))throw new Error('Salário inválido.');
  if(s.profile.palette!==undefined&&!['green','rose','violet','blue','amber','custom'].includes(s.profile.palette))throw new Error('Paleta inválida.');
  if(s.profile.surface!==undefined&&!['dark','light'].includes(s.profile.surface))throw new Error('Base de cor inválida.');
  if(s.profile.customColor!==undefined&&!/^#[0-9a-f]{6}$/i.test(s.profile.customColor))throw new Error('Cor personalizada inválida.');
  const paidMonths=new Set(),paymentIds=new Set();
  for(const payment of s.invoicePayments||[]){
    const card=s.cards.find(c=>c.id===payment.cardId),transaction=s.transactions.find(t=>t.id===payment.id);
    if(!text(payment.id,100)||paymentIds.has(payment.id)||!card||!validMonth(payment.month)||!validCivilDate(payment.date)||!integer(payment.amount)||payment.amount<=0||!Array.isArray(payment.items)||!payment.items.length||paidMonths.has(`${payment.cardId}|${payment.month}`))throw new Error('Pagamento de fatura inválido ou duplicado.');
    paymentIds.add(payment.id);paidMonths.add(`${payment.cardId}|${payment.month}`);
    if(!transaction||transaction.invoicePaymentId!==payment.id||transaction.type!=='expense'||transaction.cardId||transaction.status!=='completed'||transaction.amount!==payment.amount||transaction.accountId!==payment.accountId||transaction.date!==payment.date||transaction.settledAt!==payment.date)throw new Error('Débito de fatura inconsistente.');
    const invoice=invoiceFor(s,card,payment.month);
    const expected=new Map(invoice.items.map(i=>[`${i.transactionId}|${i.index}`,i.amount]));
    if(expected.size!==payment.items.length||invoice.total!==payment.amount)throw new Error('Composição da fatura paga foi alterada.');
    for(const item of payment.items){const key=`${item.transactionId}|${item.index}`,purchase=s.transactions.find(t=>t.id===item.transactionId);if(expected.get(key)!==item.amount||!purchase||purchase.amount!==item.purchaseAmount||purchase.date!==item.purchaseDate||(purchase.installmentCount||1)!==item.installmentCount)throw new Error('Parcela paga inválida ou compra original alterada.');expected.delete(key);}
  }
  validateRecurrences(s);
  validateAudit(s);
  return s;
}
function baseSeedState(today=localDate()) {
  const month=today.slice(0,7), prev=shiftMonth(month,-1), day=(n,m=month)=>`${m}-${String(Math.min(n,new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).getDate())).padStart(2,'0')}`;
  const categories=[['food','Alimentação','🍽️',80000,['restaurante','alimentacao','comida','bares']],['market','Supermercado','🛒',60000,['mercado','supermercado']],['home','Moradia','🏠',180000,['casa','moradia','aluguel']],['transport','Transporte','🚗',40000,['uber','transporte','combustivel']],['digital','Serviços digitais','💻',20000,['digital','software','tecnologia']],['shopping','Compras','🛍️',50000,['compra','roupa']],['health','Saúde','💚',30000,['saude','farmacia']],['education','Educação','📚',35000,['educacao','curso']],['leisure','Lazer','🎮',35000,['lazer','cinema']],['other','Outros','◌',20000,[]]].map(([id,name,icon,budget,keywords])=>({id,name,icon,budget,keywords}));
  const make=(n,description,amount,type,categoryId,accountId='bank',cardId='',dateMonth=month)=>({id:uid(),date:day(n,dateMonth),description,amount,type,categoryId,accountId,cardId,hidden:false,source:'demo'});
  const transactions=[make(5,'Salário',620000,'income','other'),make(9,'Projeto freelance',85000,'income','other','wallet'),make(6,'Aluguel',145000,'expense','home'),make(7,'Mercado da Vila',23890,'expense','market'),make(8,'Restaurante Jardim',8900,'expense','food','bank','card'),make(10,'Mobilidade urbana',2490,'expense','transport'),make(12,'Curso de tecnologia',24900,'expense','education','bank','card'),make(13,'Cinema do Centro',6200,'expense','leisure','bank','card'),make(15,'Café da Praça',2850,'expense','food'),make(16,'Cloud Workspace',5900,'expense','digital','bank','card'),make(17,'Farmácia Bem Viver',8740,'expense','health'),make(18,'Bistrô da Esquina',12450,'expense','food','bank','card'),make(19,'Mercado da Vila',18640,'expense','market'),make(20,'Loja Horizonte',17990,'expense','shopping','bank','card'),make(21,'Mobilidade urbana',3290,'expense','transport'),make(5,'Salário',620000,'income','other','bank','',prev),make(6,'Aluguel',145000,'expense','home','bank','',prev),make(9,'Mercado da Vila',40500,'expense','market','bank','',prev),make(12,'Restaurantes do mês',42700,'expense','food','bank','card',prev),make(17,'Serviços digitais',15900,'expense','digital','bank','card',prev),make(19,'Compras do mês',48900,'expense','shopping','bank','card',prev),make(21,'Transporte do mês',21500,'expense','transport','bank','',prev),make(24,'Curso e livros',32000,'expense','education','bank','card',prev)];
  return {version:1,createdAt:today,profile:{name:'Max',monthlyGoal:150000},accounts:[{id:'bank',name:'Banco Aurora',type:'Conta corrente',color:'#a78bfa',openingBalance:240000},{id:'wallet',name:'Carteira Max',type:'Dinheiro',color:'#72dbb0',openingBalance:15000}],categories,transactions,cards:[{id:'card',name:'Aurora Platinum',last4:'4242',accountId:'bank',limit:600000,dueDay:23,color:'#7962bf'}],installments:[{id:uid(),name:'Notebook de trabalho',amount:18990,count:12,paid:5,accountId:'bank',categoryId:'digital',hidden:false},{id:uid(),name:'Curso de fotografia',amount:7990,count:6,paid:3,accountId:'bank',categoryId:'education',hidden:false}],subscriptions:[{id:uid(),name:'Cloud Workspace',amount:5900,cycle:'month',nextDate:day(16,shiftMonth(month,1)),active:true,accountId:'bank'},{id:uid(),name:'Música+',amount:2190,cycle:'month',nextDate:day(25),active:true,accountId:'bank'},{id:uid(),name:'Cinema em casa',amount:3990,cycle:'month',nextDate:day(28),active:true,accountId:'bank'}],agents:[{id:uid(),name:'Guardião do orçamento',description:'Avisa quando uma categoria ultrapassa seu limite.',kind:'budget',frequency:'daily',active:true,limit:0,categoryId:''},{id:uid(),name:'Olho nas duplicadas',description:'Procura cobranças iguais no extrato.',kind:'duplicates',frequency:'weekly',active:true,limit:0,categoryId:''},{id:uid(),name:'Meu resumo',description:'Resume entradas, saídas e saldo.',kind:'summary',frequency:'monthly',active:false,limit:0,categoryId:''}],investments:[{id:uid(),name:'Reserva de emergência',kind:'Renda fixa',amount:1250000},{id:uid(),name:'Fundo de índice',kind:'Renda variável',amount:380000}],messages:[],lastAgentRun:null};
}

export function seedState(today=localDate()) {
  const state=baseSeedState(today);
  state.invoicePayments=[];
  state.recurrences=[];
  state.auditLog=[];
  for(const card of state.cards)card.closingDay=3;
  for(const transaction of state.transactions){transaction.status='completed';if(!transaction.cardId)transaction.settledAt=transaction.date;}
  return state;
}
