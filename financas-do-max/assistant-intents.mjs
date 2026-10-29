import {z} from 'zod';
import {moneyInput,normalize} from './dist/domain.mjs';

export const intentSchema=z.object({
  intent:z.enum(['create_transaction','update_transaction','delete_transaction','query','clarify']),
  type:z.enum(['expense','income']).nullable().optional(), amount:z.string().max(40).nullable().optional(),
  description:z.string().max(240).nullable().optional(), categoryName:z.string().max(80).nullable().optional(),
  accountName:z.string().max(80).nullable().optional(),cardName:z.string().max(80).nullable().optional(),
  date:z.string().max(10).nullable().optional(),installments:z.number().int().min(1).max(600).nullable().optional(),
  target:z.string().max(240).nullable().optional(),query:z.enum(['monthly','balance','category','largest','cards','accounts','categories','transactions']).nullable().optional()
}).strict();
export const todayBR=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function resolveDate(value,today){
  if(!value||['today','hoje'].includes(value))return today;
  if(['yesterday','ontem'].includes(value)){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
  return value;
}
export function reais(value){
  if(typeof value!=='string')throw new Error('Informe o valor do lançamento.');
  const clean=value.trim().replace(/\s*mil\b/i,'');
  const cents=moneyInput(clean)*(/mil\b/i.test(value)?1000:1);
  if(!Number.isSafeInteger(cents)||cents<=0||cents>100_000_000_000)throw new Error('Informe um valor positivo válido.');
  return cents;
}
export function localInterpret(message){
  const n=normalize(message),amount=message.match(/(?:r\$\s*)?(\d[\d.,]*(?:\s*mil)?)(?:\s*reais)?/i)?.[1]||null;
  const date=/anteontem|semana passada|amanha|dia\s+\d/.test(n)?'invalid':n.match(/\d{4}-\d{2}-\d{2}/)?.[0]||(/ontem/.test(n)?'yesterday':'today');
  if(/^(quanto|qual|quais|mostr|list)|saldo disponivel|maiores despesas/.test(n))return {intent:'query',query:/fatura|cartao/.test(n)?'cards':/saldo/.test(n)?'balance':/maiores/.test(n)?'largest':/categorias/.test(n)?'categories':/contas/.test(n)?'accounts':/com |combustivel|gasolina/.test(n)?'category':'monthly',description:message};
  if(/^(exclu|apag|remov|cancel)/.test(n))return {intent:'delete_transaction',target:/ultima despesa/.test(n)?'last_expense':message.replace(/^(exclui|exclua|apaga|apague|remove|remova|cancela)\s+/i,'')};
  if(/^(alter|edit|corrig)/.test(n))return {intent:'update_transaction',target:message.replace(/^(altera|altere|edita|edite|corrige|corrija)\s+(o |a )?/i,'').split(/ de \d/i)[0],amount:message.match(/para\s+(?:r\$\s*)?(\d[\d.,]*(?:\s*mil)?)/i)?.[1]||null};
  if(!/^(abasteci|gastei|paguei|lanca|lance|recebi|ganhei|comprei)\b/.test(n))return {intent:'clarify'};
  return {intent:'create_transaction',type:/^(recebi|ganhei)/.test(n)?'income':'expense',amount,description:message,date,installments:Number(n.match(/(?:em\s+)?(\d+)\s*(?:vezes|x|parcelas)/)?.[1]||1)};
}
