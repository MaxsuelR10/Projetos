import {addMonth, civilDate, validCivilDate, validMonth} from './billing.mjs';
import {occurrenceDate} from './recurrences.mjs';

export function subscriptionCalendar(state, month) {
  if (!validMonth(month)) throw new Error('Mês inválido.');
  const start=`${month}-01`,end=civilDate(month,31),events=[];
  const linkedRules=(state.recurrences||[]).filter(rule=>rule.subscriptionId);
  const ruleById=new Map(linkedRules.map(rule=>[rule.id,rule]));
  for(const transaction of state.transactions){
    const rule=ruleById.get(transaction.recurringTransactionId),subscriptionId=transaction.subscriptionId||rule?.subscriptionId;
    const subscription=state.subscriptions.find(item=>item.id===subscriptionId);
    const date=transaction.recurrenceDate||transaction.date;
    if(subscription&&date>=start&&date<=end)events.push({id:transaction.id,transactionId:transaction.id,subscriptionId,date,name:subscription.name,amount:transaction.amount,status:transaction.status||'completed',projection:false});
  }
  for(const subscription of state.subscriptions){
    const rule=linkedRules.find(item=>item.subscriptionId===subscription.id);
    if(rule){
      if(rule.status!=='active')continue;
      let index=rule.occurrencesGenerated;
      // Linked subscriptions have monthly/yearly, interval-one rules. Skip
      // efficiently to the selected month while preserving the original anchor.
      const monthGap=(Number(month.slice(0,4))-Number(rule.startDate.slice(0,4)))*12+Number(month.slice(5))-Number(rule.startDate.slice(5,7));
      index=Math.max(index,Math.max(0,Math.floor(monthGap/(rule.frequency==='year'?12:1))-1));
      for(let examined=0;examined<40;examined++,index++){
        if(rule.occurrencesLimit&&index>=rule.occurrencesLimit)break;
        const date=occurrenceDate(rule,index);
        if(date>end||rule.endDate&&date>rule.endDate)break;
        if(date<start)continue;
        if(!events.some(event=>event.subscriptionId===subscription.id&&event.date===date))events.push({id:`${subscription.id}|${date}`,subscriptionId:subscription.id,ruleId:rule.id,date,name:subscription.name,amount:rule.amount,status:'scheduled',projection:true});
      }
    }else if(subscription.active&&validCivilDate(subscription.nextDate)){
      const gap=(Number(month.slice(0,4))-Number(subscription.nextDate.slice(0,4)))*12+Number(month.slice(5))-Number(subscription.nextDate.slice(5,7));
      if(gap<0||subscription.cycle==='year'&&gap%12!==0)continue;
      const date=civilDate(addMonth(subscription.nextDate.slice(0,7),gap),Number(subscription.nextDate.slice(8)));
      if(date<subscription.nextDate)continue;
      if(!events.some(event=>event.subscriptionId===subscription.id&&event.date===date))events.push({id:`${subscription.id}|${date}`,subscriptionId:subscription.id,date,name:subscription.name,amount:subscription.amount,status:'scheduled',projection:true});
    }
  }
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
}
