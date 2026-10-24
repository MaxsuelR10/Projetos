import {moneyInput} from './domain.mjs';

export function formatCurrencyMask(value){
  const source=String(value??'');
  const negative=source.includes('-');
  const digits=source.replace(/\D/g,'').replace(/^0+(?=\d)/,'');
  if(!digits)return negative?'-':'';
  const cents=Number(digits);
  if(!Number.isSafeInteger(cents))return source;
  const formatted=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
  return negative?'-'+formatted:formatted;
}

export function digitsOnly(value,max=0){
  const digits=String(value??'').replace(/\D/g,'');
  return max?digits.slice(0,max):digits;
}

export function applyInputMasks(root=document){
  root.querySelectorAll('input[data-mask="currency"]').forEach(input=>{
    const format=()=>{input.value=formatCurrencyMask(input.value);};
    if(input.value&&!input.value.includes('R$'))input.value=formatCurrencyMask(String(moneyInput(input.value)));
    else format();
    input.addEventListener('input',()=>{format();input.setSelectionRange(input.value.length,input.value.length);});
    input.addEventListener('blur',()=>{if(input.value==='-')input.value='';});
  });
  root.querySelectorAll('input[data-mask="integer"], input[data-mask="digits"]').forEach(input=>{
    const max=Number(input.dataset.digits||input.maxLength||0);
    input.addEventListener('input',()=>{input.value=digitsOnly(input.value,max);});
  });
}
