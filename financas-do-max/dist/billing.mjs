// Pure billing rules. Dates are civil ISO dates; amounts are integer cents.
const isDay = day => Number.isInteger(day) && day >= 1 && day <= 31;
export function validMonth(month) {
  return typeof month === 'string' && /^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(month);
}
export function addMonth(month, offset) {
  if (!validMonth(month) || !Number.isInteger(offset)) throw new Error('Mês inválido.');
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function civilDate(month, day) {
  if (!validMonth(month) || !isDay(day)) throw new Error('Dia ou mês inválido.');
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
export function validCivilDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return validMonth(date.slice(0, 7)) && isDay(Number(date.slice(8))) && civilDate(date.slice(0, 7), Number(date.slice(8))) === date;
}
export const cycleConfigured = card => isDay(card.closingDay) && isDay(card.dueDay);
export function invoiceDates(card, month) {
  if (!cycleConfigured(card)) throw new Error('Informe o dia de fechamento do cartão.');
  const closingMonth = addMonth(month, card.dueDay <= card.closingDay ? -1 : 0);
  return {closingDate: civilDate(closingMonth, card.closingDay), dueDate: civilDate(month, card.dueDay)};
}
export function purchaseInvoiceMonth(card, date, installmentIndex = 0) {
  if (!validCivilDate(date) || !Number.isInteger(installmentIndex) || installmentIndex < 0) throw new Error('Compra ou parcela inválida.');
  // Legacy cards keep their calendar-month behavior until the user supplies a closing day.
  if (!cycleConfigured(card)) return addMonth(date.slice(0, 7), installmentIndex);
  const onOrAfterClosing = date >= civilDate(date.slice(0, 7), card.closingDay);
  const dueNextMonth = card.dueDay <= card.closingDay;
  return addMonth(date.slice(0, 7), Number(onOrAfterClosing) + Number(dueNextMonth) + installmentIndex);
}
export function installmentAmount(total, count, index) {
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isInteger(count) || count < 1 || count > 600 || count > total || !Number.isInteger(index) || index < 0 || index >= count) throw new Error('Quantidade de parcelas incompatível com o valor da compra.');
  return Math.floor(total / count) + Number(index < total % count);
}
const payments = state => state.invoicePayments || [];
const purchases = (state, cardId) => state.transactions.filter(t => t.cardId === cardId && t.type === 'expense' && t.status !== 'cancelled');
export const hasPaidPurchase = (state, transactionId) => payments(state).some(p => p.items.some(i => i.transactionId === transactionId));
export function invoiceFor(state, card, month) {
  if (!validMonth(month)) throw new Error('Mês da fatura inválido.');
  const payment = payments(state).find(p => p.cardId === card.id && p.month === month);
  const items = [];
  for (const transaction of purchases(state, card.id)) {
    const firstMonth = purchaseInvoiceMonth(card, transaction.date);
    const index = (Number(month.slice(0, 4)) - Number(firstMonth.slice(0, 4))) * 12 + Number(month.slice(5)) - Number(firstMonth.slice(5));
    const count = transaction.installmentCount || 1;
    if (index < 0 || index >= count) continue;
    items.push({transactionId: transaction.id, description: transaction.description, categoryId: transaction.categoryId, purchaseDate: transaction.date, index, count, amount: installmentAmount(transaction.amount, count, index)});
  }
  items.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || a.description.localeCompare(b.description));
  const dates = cycleConfigured(card) ? invoiceDates(card, month) : {closingDate: null, dueDate: civilDate(month, card.dueDay)};
  return {cardId: card.id, month, ...dates, configured: cycleConfigured(card), items, total: items.reduce((sum, item) => sum + item.amount, 0), payment, status: payment ? 'paid' : 'open'};
}
export function cardCommitment(state, card) {
  const total = purchases(state, card.id).reduce((sum, t) => sum + t.amount, 0);
  const paid = payments(state).filter(p => p.cardId === card.id).reduce((sum, p) => sum + p.amount, 0);
  const used = Math.max(0, total - paid);
  return {used, available: Math.max(0, card.limit - used), overLimit: Math.max(0, used - card.limit)};
}
export function creditInstallmentPlans(state) {
  return state.transactions.filter(t=>t.cardId&&t.type==='expense'&&t.status!=='cancelled'&&(t.installmentCount||1)>1).map(transaction=>{
    const count=transaction.installmentCount,card=state.cards.find(c=>c.id===transaction.cardId);
    const paidItems=payments(state).flatMap(p=>p.items).filter(item=>item.transactionId===transaction.id);
    const paidIndexes=new Set(paidItems.map(item=>item.index));
    let nextIndex=0;while(nextIndex<count&&paidIndexes.has(nextIndex))nextIndex++;
    return {id:transaction.id,transactionId:transaction.id,cardId:card.id,name:transaction.description,accountId:transaction.accountId,categoryId:transaction.categoryId,amount:installmentAmount(transaction.amount,count,Math.min(nextIndex,count-1)),count,paid:paidIndexes.size,totalAmount:transaction.amount,paidAmount:paidItems.reduce((sum,item)=>sum+item.amount,0),nextMonth:purchaseInvoiceMonth(card,transaction.date,Math.min(nextIndex,count-1)),hidden:false};
  });
}
export function assertPurchaseEditable(state, id) {
  if (hasPaidPurchase(state, id)) throw new Error('Esta compra compõe uma fatura já paga. Seu registro está protegido.');
}
export function assertPurchaseAllowed(state, transaction) {
  if (!transaction.cardId || transaction.status === 'cancelled') return;
  const card = state.cards.find(c => c.id === transaction.cardId);
  if (!card || card.accountId !== transaction.accountId || transaction.type !== 'expense') throw new Error('A compra precisa usar um cartão da conta selecionada.');
  const count = transaction.installmentCount || 1;
  installmentAmount(transaction.amount, count, 0);
  for (let i = 0; i < count; i++) {
    const reference = purchaseInvoiceMonth(card, transaction.date, i);
    if (payments(state).some(p => p.cardId === card.id && p.month === reference)) throw new Error('A compra cairia em uma fatura já paga. Revise a data ou o cartão.');
  }
}
export function registerInvoicePayment(state, {cardId, month, accountId, date, id}) {
  if (!validCivilDate(date)) throw new Error('Informe uma data válida para o pagamento.');
  if (!id || state.transactions.some(t => t.id === id)) throw new Error('Identificador de pagamento inválido.');
  const card = state.cards.find(c => c.id === cardId);
  if (!card) throw new Error('Cartão não encontrado.');
  if (!state.accounts.some(a => a.id === accountId)) throw new Error('Selecione uma conta de pagamento válida.');
  const invoice = invoiceFor(state, card, month);
  if (!invoice.configured) throw new Error('Configure o fechamento do cartão antes de registrar pagamentos.');
  if (invoice.payment) throw new Error('Esta fatura já foi paga. Nenhum débito adicional foi registrado.');
  if (!invoice.total) throw new Error('Uma fatura vazia não pode ser paga.');
  const payment = {id, cardId, month, accountId, date, amount: invoice.total, items: invoice.items.map(item => ({transactionId: item.transactionId, index: item.index, amount: item.amount, purchaseAmount: state.transactions.find(t=>t.id===item.transactionId).amount, purchaseDate: item.purchaseDate, installmentCount: item.count}))};
  const categoryId=state.categories.find(c=>c.id==='other')?.id||state.categories[0]?.id||'';
  const transaction = {id, description: `Pagamento de fatura · ${card.name} · ${month}`, amount: invoice.total, date, settledAt: date, type: 'expense', status: 'completed', categoryId, accountId, cardId: '', hidden: false, source: 'invoice', invoicePaymentId: id};
  // Caller commits a cloned state once; validation/storage failure leaves the original intact.
  (state.invoicePayments ||= []).push(payment);
  state.transactions.push(transaction);
  return payment;
}
