import {financialReport, currency, normalize} from './domain.mjs';
import {validCivilDate, cycleConfigured, purchaseInvoiceMonth, installmentAmount, invoiceFor, cardCommitment} from './billing.mjs';

export const isPurchaseQuestion = message => /\b(posso comprar|consigo comprar|quero comprar|pretendo comprar|cabe.{0,30}orcamento|comprar.{0,60}(posso|consigo|orcamento)|da pra comprar)\b/.test(normalize(message));
const invalid = message => { throw Object.assign(new Error(message), {status:400}); };

// Shared by the browser and authenticated server. Never writes a purchase.
export function evaluatePurchase(state, input) {
  if (!input || !Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 100_000_000_000) invalid('Informe um valor positivo em reais.');
  if (!validCivilDate(input.date)) invalid('Informe uma data válida para a compra.');
  if (!Number.isInteger(input.installments) || input.installments < 1 || input.installments > 120 || input.installments > input.amount) invalid('Informe de 1 a 120 parcelas compatíveis com o valor.');
  const category = state.categories.find(c => c.id === input.categoryId);
  if (!category) invalid('Escolha a categoria da compra.');
  if (!['cash','card'].includes(input.payment)) invalid('Escolha a forma de pagamento.');
  const card = input.payment === 'card' ? state.cards.find(c => c.id === input.cardId) : null;
  if (input.payment === 'card' && !card) invalid('Escolha o cartão da compra.');
  if (card && !cycleConfigured(card)) invalid('Configure o fechamento e o vencimento desse cartão na tela Cartões antes de simular.');
  if (!card && input.installments !== 1) invalid('Para parcelar, escolha um cartão.');
  const months = Array.from({length:input.installments}, (_, index) => {
    const month = card ? purchaseInvoiceMonth(card,input.date,index) : input.date.slice(0,7);
    const amount = installmentAmount(input.amount,input.installments,index);
    const used = financialReport(state,month,{basis:'consumption'}).categories.find(c => c.id === category.id).total;
    const invoice = card ? invoiceFor(state,card,month) : null;
    return {month,amount,used,remaining:category.budget-used,after:category.budget-used-amount,invoiceBefore:invoice?.total,invoiceAfter:invoice ? invoice.total+amount : null,paidInvoice:invoice?.status === 'paid'};
  });
  const commitment = card ? cardCommitment(state,card) : null;
  const budgetConfigured = Number.isSafeInteger(category.budget) && category.budget > 0;
  const categoryFits = budgetConfigured ? months.every(m => m.after >= 0) : null;
  const cardFits = commitment ? commitment.available >= input.amount : null;
  return {category:category.name,total:input.amount,installments:input.installments,months,budget:category.budget,budgetConfigured,categoryFits,card:card?.name,cardAvailable:commitment?.available,cardFits,paidInvoice:months.some(m => m.paidInvoice)};
}

export function purchaseBudgetReply(state,input) {
  const r=evaluatePurchase(state,input);
  const lines=[`Simulação de compra: ${currency(r.total)}${r.card ? ` em ${r.installments}x no ${r.card}` : ' à vista'}. Categoria: ${r.category}.`];
  if (!r.budgetConfigured) lines.push('Essa categoria não tem um limite de orçamento definido. Cadastre o limite em Categorias para saber se a compra cabe.');
  else lines.push(r.categoryFits ? 'Cabe no orçamento da categoria nos meses simulados.' : 'Não cabe no orçamento da categoria em pelo menos um mês.');
  const shown=r.months.length<=6?r.months:[...r.months.slice(0,3),...r.months.filter(m=>m.after<0).slice(0,3)];
  const unique=[...new Map(shown.map(m=>[m.month,m])).values()];
  for (const m of unique) {
    lines.push(`${m.month}: limite ${currency(r.budget)}, já comprometido ${currency(m.used)}, nova ${r.installments>1?'parcela':'compra'} ${currency(m.amount)}.${r.budgetConfigured ? ` Disponível antes: ${currency(m.remaining)}; ${m.after<0?`excesso após a compra: ${currency(-m.after)}`:`sobra após a compra: ${currency(m.after)}`}.` : ''}${r.card ? ` Fatura total: ${currency(m.invoiceBefore)} → ${currency(m.invoiceAfter)}.` : ''}`);
  }
  if(r.months.length>unique.length)lines.push(`Foram avaliados os ${r.months.length} meses, de ${r.months[0].month} a ${r.months.at(-1).month}; ${r.months.filter(m=>m.after<0).length} mês(es) acima do limite da categoria.`);
  if(r.card)lines.push(`Limite disponível registrado do cartão: ${currency(r.cardAvailable)}. ${r.cardFits?'Comporta o valor total da compra.':'Não comporta o valor total da compra.'}`);
  if(r.paidInvoice)lines.push('A data escolhida inclui uma fatura já paga. Revise a data antes de considerar essa compra.');
  lines.push('Estimativa com os registros atuais e os limites atuais da categoria, sem juros e sem registrar a compra. Caber na categoria e no cartão não garante dinheiro para pagar a fatura; confira o saldo e as demais contas.');
  return lines.join('\n\n');
}
