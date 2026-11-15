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
  return {startDate: civilDate(addMonth(closingMonth, -1), card.closingDay), closingDate: civilDate(closingMonth, card.closingDay), dueDate: civilDate(month, card.dueDay)};
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
const activePayments = state => payments(state).filter(payment => !payment.cancelledAt);
const purchases = (state, cardId) => state.transactions.filter(t => t.cardId === cardId && t.type === 'expense' && t.status !== 'cancelled');
export const hasPaidPurchase = (state, transactionId) => activePayments(state).some(p => p.items.some(i => i.transactionId === transactionId));
export function invoiceFor(state, card, month, today) {
  if (!validMonth(month)) throw new Error('Mês da fatura inválido.');
  const history = payments(state).filter(p => p.cardId === card.id && p.month === month);
  const recorded = history.filter(p => !p.cancelledAt);
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
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const paidAmount = recorded.reduce((sum, payment) => sum + payment.amount, 0);
  const remainingAmount = total - paidAmount;
  const payment = total > 0 && remainingAmount === 0
    ? recorded.reduce((latest, item) => !latest || item.date >= latest.date ? item : latest, undefined)
    : undefined;
  const status = payment ? 'paid'
    : remainingAmount > 0 && today > dates.dueDate ? 'overdue'
    : dates.closingDate && today >= dates.closingDate ? 'closed' : 'open';
  return {cardId: card.id, month, ...dates, configured: cycleConfigured(card), items, total, paidAmount, remainingAmount, payment, payments: history, status};
}
export function invoiceMonths(state, card, beforeMonth) {
  const months = new Set();
  for (const transaction of purchases(state, card.id)) {
    const firstMonth = purchaseInvoiceMonth(card, transaction.date);
    for (let index = 0; index < (transaction.installmentCount || 1); index++) {
      const month = addMonth(firstMonth, index);
      if (month >= beforeMonth) break;
      months.add(month);
    }
  }
  return [...months].sort();
}
export function cardCommitment(state, card) {
  const total = purchases(state, card.id).reduce((sum, t) => sum + t.amount, 0);
  const paid = activePayments(state).filter(p => p.cardId === card.id).reduce((sum, p) => sum + p.amount, 0);
  const used = Math.max(0, total - paid);
  return {used, available: Math.max(0, card.limit - used), overLimit: Math.max(0, used - card.limit)};
}
export function creditInstallmentPlans(state) {
  const paidByInvoice = new Map();
  for (const payment of activePayments(state)) {
    const key = JSON.stringify([payment.cardId, payment.month]);
    const records = paidByInvoice.get(key) || [];
    records.push(payment);
    paidByInvoice.set(key, records);
  }
  const paidByPurchase = new Map();
  for (const records of paidByInvoice.values()) {
    let paid = records.reduce((sum, item) => sum + item.amount, 0);
    const latest = records.reduce((fullest, item) => item.items.length >= fullest.items.length ? item : fullest);
    for (const item of latest.items) {
      const installments = paidByPurchase.get(item.transactionId) || new Map();
      installments.set(item.index, Math.min(item.amount, paid));
      paidByPurchase.set(item.transactionId, installments);
      paid = Math.max(0, paid - item.amount);
    }
  }
  return state.transactions.filter(t=>t.cardId&&t.type==='expense'&&t.status!=='cancelled'&&(t.installmentCount||1)>1).map(transaction=>{
    const count=transaction.installmentCount,card=state.cards.find(c=>c.id===transaction.cardId);
    const paidItems=paidByPurchase.get(transaction.id) || new Map();
    const paidIndexes=new Set([...paidItems].filter(([index, amount])=>amount===installmentAmount(transaction.amount,count,index)).map(([index])=>index));
    let nextIndex=0;while(nextIndex<count&&paidIndexes.has(nextIndex))nextIndex++;
    return {id:transaction.id,transactionId:transaction.id,cardId:card.id,name:transaction.description,accountId:transaction.accountId,categoryId:transaction.categoryId,amount:installmentAmount(transaction.amount,count,Math.min(nextIndex,count-1))-(paidItems.get(nextIndex)||0),count,paid:paidIndexes.size,totalAmount:transaction.amount,paidAmount:[...paidItems.values()].reduce((sum,amount)=>sum+amount,0),nextMonth:purchaseInvoiceMonth(card,transaction.date,Math.min(nextIndex,count-1)),hidden:false};
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
  const paidMonths = new Set(activePayments(state).filter(payment => payment.cardId === card.id).map(payment => payment.month));
  for (let i = 0; i < count; i++) {
    const reference = purchaseInvoiceMonth(card, transaction.date, i);
    if (paidMonths.has(reference) && invoiceFor(state, card, reference).status === 'paid') throw new Error('A compra cairia em uma fatura já paga. Revise a data ou o cartão.');
  }
}
function validatePaymentDetails(state, accountId, date, amount, available) {
  if (!validCivilDate(date)) throw new Error('Informe uma data válida para o pagamento.');
  if (!state.accounts.some(a => a.id === accountId)) throw new Error('Selecione uma conta de pagamento válida.');
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > available) throw new Error('Informe um valor de pagamento entre um centavo e o saldo da fatura.');
}
export function registerInvoicePayment(state, {cardId, month, accountId, date, id, amount}) {
  if (!id || state.transactions.some(t => t.id === id)) throw new Error('Identificador de pagamento inválido ou já utilizado.');
  const card = state.cards.find(c => c.id === cardId);
  if (!card) throw new Error('Cartão não encontrado.');
  const invoice = invoiceFor(state, card, month);
  if (!invoice.configured) throw new Error('Configure o fechamento do cartão antes de registrar pagamentos.');
  if (invoice.payment) throw new Error('Esta fatura já foi paga. Nenhum débito adicional foi registrado.');
  if (!invoice.total) throw new Error('Uma fatura vazia não pode ser paga.');
  amount ??= invoice.remainingAmount;
  validatePaymentDetails(state, accountId, date, amount, invoice.remainingAmount);
  const payment = {id, cardId, month, accountId, date, amount, originalAmount: invoice.total, items: invoice.items.map(item => ({transactionId: item.transactionId, index: item.index, amount: item.amount, purchaseAmount: state.transactions.find(t=>t.id===item.transactionId).amount, purchaseDate: item.purchaseDate, installmentCount: item.count}))};
  const categoryId=state.categories.find(c=>c.id==='other')?.id||state.categories[0]?.id||'';
  const transaction = {id, description: `Pagamento de fatura · ${card.name} · ${month}`, amount, date, settledAt: date, type: 'expense', status: 'completed', categoryId, accountId, cardId: '', hidden: false, source: 'invoice', invoicePaymentId: id};
  // Caller commits a cloned state once; validation/storage failure leaves the original intact.
  (state.invoicePayments ||= []).push(payment);
  state.transactions.push(transaction);
  return payment;
}
export function editInvoicePayment(state, id, {accountId, date, amount}) {
  const payment = activePayments(state).find(item => item.id === id);
  if (!payment) throw new Error('Pagamento ativo não encontrado.');
  const card = state.cards.find(item => item.id === payment.cardId);
  const invoice = invoiceFor(state, card, payment.month);
  validatePaymentDetails(state, accountId, date, amount, invoice.remainingAmount + payment.amount);
  payment.originalAmount ??= invoice.total;
  Object.assign(payment, {accountId, date, amount});
  Object.assign(state.transactions.find(item => item.id === id), {accountId, date, settledAt: date, amount});
}
export function cancelInvoicePayment(state, id, date) {
  if (!validCivilDate(date)) throw new Error('Data de cancelamento inválida.');
  const payment = activePayments(state).find(item => item.id === id);
  if (!payment) throw new Error('Pagamento ativo não encontrado.');
  payment.cancelledAt = date;
  state.transactions.find(item => item.id === id).status = 'cancelled';
}
