import {assertPurchaseAllowed, assertPurchaseEditable, validCivilDate} from './billing.mjs';

const findTransaction = (state, id) => {
  const transaction = state.transactions.find(row => row.id === id);
  if (!transaction) throw new Error('Lançamento não encontrado.');
  if (transaction.invoicePaymentId) throw new Error('Pagamentos de fatura possuem vínculo protegido.');
  return transaction;
};

export function settleTransaction(state, id, date) {
  const transaction = findTransaction(state, id);
  if (transaction.cardId) throw new Error('Compras no cartão são liquidadas pela fatura.');
  if (transaction.status !== 'pending') throw new Error('Somente lançamentos pendentes podem ser liquidados.');
  if (!validCivilDate(date)) throw new Error('Informe uma data válida para a liquidação.');
  transaction.status = 'completed';
  transaction.settledAt = date;
  return transaction;
}

export function cancelTransaction(state, id) {
  const transaction = findTransaction(state, id);
  if (transaction.status === 'cancelled') throw new Error('Este lançamento já foi cancelado.');
  assertPurchaseEditable(state, id);
  transaction.status = 'cancelled';
  transaction.settledAt = null;
  return transaction;
}

export function restoreTransaction(state, id) {
  const transaction = findTransaction(state, id);
  if (transaction.status !== 'cancelled') throw new Error('Este lançamento não está cancelado.');
  const next = {...transaction, status: transaction.cardId ? 'completed' : 'pending', settledAt: null};
  assertPurchaseAllowed(state, next);
  Object.assign(transaction, next);
  return transaction;
}

// Classification changes metadata, never duplicates the original cash debit.
export function markSubscription(state, {transactionId, subscriptionId = '', id, name, cycle, nextDate}) {
  const transaction = state.transactions.find(row => row.id === transactionId);
  if (!transaction || transaction.type !== 'expense' || transaction.invoicePaymentId || transaction.status === 'cancelled') throw new Error('Escolha uma despesa válida para identificar a assinatura.');
  if (transaction.installmentCount > 1) throw new Error('Uma compra parcelada não deve ser identificada como assinatura.');
  if (transaction.subscriptionId) throw new Error('Esta transação já está vinculada a uma assinatura.');
  let subscription = state.subscriptions.find(row => row.id === subscriptionId);
  if (subscriptionId && !subscription) throw new Error('Assinatura não encontrada.');
  if (!subscription) {
    if (typeof id !== 'string' || !id || state.subscriptions.some(row => row.id === id)) throw new Error('Identificador de assinatura inválido.');
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || !['month','year'].includes(cycle) || !validCivilDate(nextDate)) throw new Error('Revise o nome, a frequência e a próxima cobrança.');
    subscription = {id, name: name.trim(), cycle, nextDate, amount: transaction.amount, categoryId: transaction.categoryId, accountId: transaction.accountId, active: true};
    state.subscriptions.push(subscription);
  }
  transaction.isSubscription = true;
  transaction.subscriptionId = subscription.id;
  return subscription;
}
