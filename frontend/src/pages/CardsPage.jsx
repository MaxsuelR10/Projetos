import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { accountService } from '../services/account.service.js'
import { cardService } from '../services/card.service.js'
import { categoryService } from '../services/category.service.js'
import { brazilianCivilDate, formatCurrency, parseCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'
import { CurrencyInput } from '../components/forms/CurrencyInput.jsx'
import { useConfirm } from '../hooks/useConfirm.js'
import { useToast } from '../hooks/useToast.js'
import { FormDrawer } from '../components/feedback/FormDrawer.jsx'
import { useSearchParams } from 'react-router-dom'
import { notifyFinancialDataChanged } from '../utils/financial-events.js'

const today = brazilianCivilDate()
const emptyCard = { name: '', institution: '', brand: '', type: 'CREDIT', creditLimit: '', closingDay: '25', dueDay: '5', color: '#263B71' }
const emptyPurchase = { categoryId: '', subcategoryId: '', description: '', merchant: '', totalAmount: '', purchaseDate: today, installmentsCount: '1', notes: '' }

function invoiceLabel(invoice) { return `${String(invoice.referenceMonth).padStart(2, '0')}/${invoice.referenceYear}` }
function formatDate(value) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value)) }
const invoiceStatusLabels = { OPEN: 'Aberta', CLOSED: 'Fechada', OVERDUE: 'Atrasada', PAID: 'Paga' }
const emptyPayment = { accountId: '', date: '', amount: '' }

export function CardsPage() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const requestConfirmation = useConfirm()
  const toast = useToast()
  const [cards, setCards] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [invoices, setInvoices] = useState([])
  const [invoiceMonth, setInvoiceMonth] = useState(() => searchParams.get('month') || today.slice(0, 7))
  const [purchases, setPurchases] = useState([])
  const [cardForm, setCardForm] = useState(emptyCard)
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchase)
  const [payment, setPayment] = useState(emptyPayment)
  const [editingPayment, setEditingPayment] = useState(null)
  const paymentBusy = useRef(false)
  const paymentAttempt = useRef(null)
  const [formOpen, setFormOpen] = useState(false)
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const selectedCard = cards.find((card) => card.id === selectedId)
  const visibleInvoices = invoices.filter((invoice) => `${invoice.referenceYear}-${String(invoice.referenceMonth).padStart(2, '0')}` === invoiceMonth)
  const visiblePurchases = purchases.filter((purchase) => purchase.installments.some((item) => `${item.invoice.referenceYear}-${String(item.invoice.referenceMonth).padStart(2, '0')}` === invoiceMonth))
  const expenseCategories = useMemo(() => categories.filter((item) => item.type === 'EXPENSE'), [categories])
  const selectedCategory = expenseCategories.find((item) => item.id === purchaseForm.categoryId)

  const loadDetail = useCallback(async (cardId) => {
    if (!cardId) { setInvoices([]); setPurchases([]); return }
    const [loadedInvoices, loadedPurchases] = await Promise.all([cardService.listInvoices(cardId, 'all'), cardService.listPurchases(cardId)])
    setInvoices(loadedInvoices); setPurchases(loadedPurchases)
  }, [])
  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [loadedCards, loadedAccounts, loadedCategories] = await Promise.all([cardService.list('all'), accountService.list('active'), categoryService.list('active')])
      setCards(loadedCards); setAccounts(loadedAccounts); setCategories(loadedCategories)
      const requestedId = selectedId || searchParams.get('cardId')
      const nextId = requestedId && loadedCards.some((card) => card.id === requestedId) ? requestedId : loadedCards[0]?.id || ''
      setSelectedId(nextId)
      if (nextId) await loadDetail(nextId)
      setError('')
    } catch (requestError) { setError(getApiError(requestError)) } finally { setIsLoading(false) }
  }, [loadDetail, selectedId, searchParams])
  useEffect(() => {
    const timerId = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timerId)
  }, [load])

  function changeCard(event) { setCardForm((current) => ({ ...current, [event.target.name]: event.target.value })) }
  function changePurchase(event) { const { name, value } = event.target; setPurchaseForm((current) => ({ ...current, [name]: value, ...(name === 'categoryId' ? { subcategoryId: '' } : {}) })) }
  async function chooseCard(id) { setSelectedId(id); try { await loadDetail(id) } catch (requestError) { setError(getApiError(requestError)) } }
  async function submitCard(event) {
    event.preventDefault(); setIsSubmitting(true); setError('')
    try {
      const payload = { ...cardForm, creditLimit: cardForm.type === 'CREDIT' ? parseCurrency(cardForm.creditLimit) : '0', closingDay: cardForm.type === 'CREDIT' ? Number(cardForm.closingDay) : null, dueDay: cardForm.type === 'CREDIT' ? Number(cardForm.dueDay) : null, institution: cardForm.institution || null, brand: cardForm.brand || null }
      const card = editingCard ? await cardService.update(editingCard.id, payload) : await cardService.create(payload)
      setFormOpen(false); setEditingCard(null); setCardForm(emptyCard); setSelectedId(card.id); await load()
    } catch (requestError) { setError(getApiError(requestError)) } finally { setIsSubmitting(false) }
  }
  function editCard(card) { setEditingCard(card); setCardForm({ name: card.name, institution: card.institution || '', brand: card.brand || '', type: card.type, creditLimit: card.creditLimit, closingDay: String(card.closingDay || 25), dueDay: String(card.dueDay || 5), color: card.color || '#263B71' }); setFormOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  async function submitPurchase(event) {
    event.preventDefault(); if (!selectedId) return; setIsSubmitting(true); setError('')
    try {
      await cardService.createPurchase(selectedId, { ...purchaseForm, totalAmount: parseCurrency(purchaseForm.totalAmount), subcategoryId: purchaseForm.subcategoryId || null, merchant: purchaseForm.merchant || null, notes: purchaseForm.notes || null, installmentsCount: Number(purchaseForm.installmentsCount) })
      setPurchaseForm((current) => ({ ...emptyPurchase, categoryId: current.categoryId, purchaseDate: today })); setPurchaseFormOpen(false); await load()
    } catch (requestError) { setError(getApiError(requestError)) } finally { setIsSubmitting(false) }
  }
  async function savePayment(action, confirmation, message) {
    if (paymentBusy.current) return
    paymentBusy.current = true
    setIsSubmitting(true)
    try {
      if (!(await requestConfirmation(confirmation))) return
      const updated = await action()
      setInvoices((current) => current.map((item) => item.id === updated.id ? updated : item))
      setPayment(emptyPayment)
      setEditingPayment(null)
      paymentAttempt.current = null
      notifyFinancialDataChanged()
      toast.success(message)
      await load()
    } catch (requestError) {
      toast.error(getApiError(requestError))
    } finally {
      paymentBusy.current = false
      setIsSubmitting(false)
    }
  }
  function pay(invoice) {
    if (!payment.accountId) { toast.error('Selecione a conta para registrar o pagamento.'); return }
    const existing = editingPayment?.invoiceId === invoice.id ? editingPayment : null
    const amount = payment.amount ? parseCurrency(payment.amount) : existing?.amount
    const displayAmount = amount ?? invoice.remainingAmount
    const data = { accountId: payment.accountId, date: payment.date || undefined, amount }
    const signature = JSON.stringify([invoice.id, data])
    function request() {
      if (existing) return cardService.editInvoicePayment(invoice.id, existing.id, data)
      if (paymentAttempt.current?.signature !== signature) paymentAttempt.current = { signature, id: window.crypto.randomUUID() }
      return cardService.payInvoice(invoice.id, { ...data, paymentId: paymentAttempt.current.id })
    }
    void savePayment(request, {
      title: existing ? 'Alterar pagamento?' : 'Registrar pagamento?',
      message: `${formatCurrency(displayAmount, user.currency)} para a fatura de ${invoiceLabel(invoice)}.`,
      confirmLabel: existing ? 'Salvar pagamento' : 'Registrar pagamento',
    }, existing ? 'Pagamento atualizado.' : 'Pagamento registrado.')
  }
  function cancelPayment(invoice, record) {
    void savePayment(() => cardService.cancelInvoicePayment(invoice.id, record.id), {
      title: 'Cancelar pagamento?',
      message: `${formatCurrency(record.amount, user.currency)} volta para o saldo da conta de pagamento.`,
      confirmLabel: 'Cancelar pagamento', destructive: true,
    }, 'Pagamento cancelado.')
  }
  async function cancelPurchase(purchase) {
    if (!(await requestConfirmation({ title: 'Cancelar compra?', message: `A compra “${purchase.description}” e suas parcelas pendentes serão canceladas.`, confirmLabel: 'Cancelar compra', destructive: true, icon: '!' }))) return
    try { await cardService.cancelPurchase(purchase.id); toast.success('Compra cancelada com sucesso.'); await load() } catch (requestError) { toast.error(getApiError(requestError)) }
  }

  return <section className="page-stack">
    <div className="page-heading with-action"><div><p className="eyebrow">Fase 4 · Cartões</p><h1>Cartões e faturas</h1><p>Acompanhe limite, compras parceladas e pagamentos sem misturar fatura com saldo disponível.</p></div><button className="primary-button inline-button" type="button" onClick={() => { setEditingCard(null); setCardForm(emptyCard); setFormOpen(true) }}>+ Novo cartão</button></div>
    {error ? <div className="form-alert" role="alert">{error}</div> : null}
    {formOpen ? <FormDrawer open eyebrow={editingCard ? 'Editar cartão' : 'Novo cartão'} title="Dados do cartão" onClose={() => { setFormOpen(false); setEditingCard(null) }}><form className="entity-form" onSubmit={submitCard}>
      <label className="form-field"><span>Nome</span><input name="name" value={cardForm.name} onChange={changeCard} required minLength="2" placeholder="Ex.: Nubank Platinum" /></label><label className="form-field"><span>Banco</span><input name="institution" value={cardForm.institution} onChange={changeCard} placeholder="Opcional" /></label>
      <label className="form-field"><span>Tipo</span><select name="type" value={cardForm.type} onChange={changeCard}><option value="CREDIT">Crédito</option><option value="DEBIT">Débito</option></select></label><label className="form-field"><span>Bandeira</span><input name="brand" value={cardForm.brand} onChange={changeCard} placeholder="Ex.: Visa" /></label>
      {cardForm.type === 'CREDIT' ? <><label className="form-field"><span>Limite</span><CurrencyInput name="creditLimit" value={cardForm.creditLimit} onChange={changeCard} required /></label><label className="form-field"><span>Dia de fechamento</span><input name="closingDay" value={cardForm.closingDay} onChange={changeCard} required type="number" min="1" max="31" /></label><label className="form-field"><span>Dia de vencimento</span><input name="dueDay" value={cardForm.dueDay} onChange={changeCard} required type="number" min="1" max="31" /></label></> : null}
      <label className="form-field color-field"><span>Cor</span><input name="color" value={cardForm.color} onChange={changeCard} type="color" /></label><button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar cartão'}</button>
    </form></FormDrawer> : null}
    {isLoading ? <p className="loading-inline">Carregando cartões...</p> : null}
    {!isLoading && cards.length === 0 ? <EmptyState title="Nenhum cartão cadastrado" description="Adicione seus cartões de crédito para acompanhar limites e faturas." action={<button className="primary-button inline-button" onClick={() => setFormOpen(true)}>Cadastrar cartão</button>} /> : null}
    {!isLoading && cards.length > 0 ? <div className="card-selector">{cards.map((card) => <article className={`credit-card ${card.id === selectedId ? 'is-selected' : ''} ${card.isActive ? '' : 'is-inactive'}`} key={card.id} onClick={() => chooseCard(card.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseCard(card.id) } }} role="button" tabIndex="0" style={{ '--card-color': card.color || '#263B71' }}><button type="button" className="card-edit-button" aria-label={`Editar cartão ${card.name}`} title="Editar cartão" onClick={(event) => { event.stopPropagation(); editCard(card) }}>✎</button><span>{card.brand || (card.type === 'CREDIT' ? 'CRÉDITO' : 'DÉBITO')}</span><strong>{card.name}</strong>{card.type === 'CREDIT' ? <small>Disponível: {formatCurrency(card.availableLimit, user.currency)} de {formatCurrency(card.creditLimit, user.currency)}</small> : <small>Cartão de débito</small>}</article>)}</div> : null}
    {selectedCard?.type === 'CREDIT' ? <>
      <section className="editor-card invoice-month-controls"><label className="form-field"><span>Fatura do mês (vencimento)</span><input aria-label="Mês da fatura" type="month" value={invoiceMonth} onChange={(event) => setInvoiceMonth(event.target.value)} /></label><p>Fecha no dia {selectedCard.closingDay}. Compras a partir do fechamento entram na próxima fatura. O limite utilizado inclui também parcelas futuras.</p><div className="invoice-month-shortcuts">{invoices.map((invoice) => <button type="button" className="secondary-button inline-button" key={invoice.id} onClick={() => setInvoiceMonth(`${invoice.referenceYear}-${String(invoice.referenceMonth).padStart(2, '0')}`)}>{invoiceLabel(invoice)}{invoice.status === 'PAID' ? ' · Paga' : ''}</button>)}</div></section>
      <section className="limit-summary"><article><span>Limite utilizado</span><strong>{formatCurrency(selectedCard.usedLimit, user.currency)}</strong></article><article><span>Limite disponível</span><strong>{formatCurrency(selectedCard.availableLimit, user.currency)}</strong></article><article><span>Fechamento / vencimento</span><strong>Dia {selectedCard.closingDay} / {selectedCard.dueDay}</strong></article></section>
      <div className="section-heading"><div><p className="eyebrow">Compras</p><h2>Registre uma compra no cartão</h2></div><button className="primary-button inline-button" type="button" onClick={() => setPurchaseFormOpen(true)}>+ Adicionar compra</button></div>
      <FormDrawer open={purchaseFormOpen} eyebrow="Nova compra" title={`Adicionar ao ${selectedCard.name}`} wide onClose={() => setPurchaseFormOpen(false)}><form className="entity-form" onSubmit={submitPurchase}>
        <label className="form-field"><span>Descrição</span><input name="description" value={purchaseForm.description} onChange={changePurchase} required minLength="2" placeholder="Ex.: Notebook" /></label><label className="form-field"><span>Estabelecimento</span><input name="merchant" value={purchaseForm.merchant} onChange={changePurchase} placeholder="Opcional" /></label><label className="form-field"><span>Valor total</span><CurrencyInput name="totalAmount" value={purchaseForm.totalAmount} onChange={changePurchase} required /></label><label className="form-field"><span>Data da compra</span><input name="purchaseDate" value={purchaseForm.purchaseDate} onChange={changePurchase} required type="date" /></label><label className="form-field"><span>Parcelas</span><input name="installmentsCount" value={purchaseForm.installmentsCount} onChange={changePurchase} required type="number" min="1" max="120" step="1" /></label><label className="form-field"><span>Categoria</span><select name="categoryId" value={purchaseForm.categoryId} onChange={changePurchase} required><option value="">Selecione</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>{selectedCategory?.subcategories?.length ? <label className="form-field"><span>Subcategoria</span><select name="subcategoryId" value={purchaseForm.subcategoryId} onChange={changePurchase}><option value="">Sem subcategoria</option>{selectedCategory.subcategories.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}<label className="form-field form-field-wide"><span>Observações</span><input name="notes" value={purchaseForm.notes} onChange={changePurchase} placeholder="Opcional" /></label><button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Adicionando...' : 'Adicionar compra'}</button>
      </form></FormDrawer>
      <section className="movement-history">
        <div className="section-heading"><div><p className="eyebrow">Faturas</p><h2>Fatura selecionada · {invoiceMonth}</h2></div></div>
        {visibleInvoices.length === 0 ? <EmptyState title="Sem fatura neste mês" description="Selecione outro mês para consultar as demais faturas." /> : <div className="invoice-list">
          {visibleInvoices.map((invoice) => {
            const isPayable = Number(invoice.remainingAmount) > 0
            const isEditing = editingPayment?.invoiceId === invoice.id
            const statusLabel = invoiceStatusLabels[invoice.effectiveStatus]

            return <article className="invoice-card" key={invoice.id}>
              <div>
                <span className={`status-tag status-${invoice.effectiveStatus.toLowerCase()}`}>{statusLabel}</span>
                <h3>Fatura {invoiceLabel(invoice)}</h3>
                <small>Fecha em {formatDate(invoice.closingDate)} · Vence em {formatDate(invoice.dueDate)} · {invoice.installments.length} lançamento(s)</small>
              </div>
              <strong>Original {formatCurrency(invoice.totalAmount, user.currency)}</strong>
              <p>Pago {formatCurrency(invoice.paidAmount, user.currency)} · Saldo {formatCurrency(invoice.remainingAmount, user.currency)}</p>
              {isPayable || isEditing ? <div className="invoice-pay">
                <select aria-label="Conta de pagamento" value={payment.accountId} onChange={(event) => setPayment((current) => ({ ...current, accountId: event.target.value }))}>
                  <option value="">Conta de pagamento</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <label className="form-field"><span>Valor pago</span><CurrencyInput name="amount" value={payment.amount || (isEditing ? editingPayment.amount : invoice.remainingAmount)} onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))} /></label>
                <label className="form-field"><span>Data do pagamento</span><input type="date" value={payment.date} onChange={(event) => setPayment((current) => ({ ...current, date: event.target.value }))} /></label>
                <button type="button" className="primary-button inline-button" disabled={isSubmitting} onClick={() => pay(invoice)}>{isEditing ? 'Salvar pagamento' : 'Pagar'}</button>
                {isEditing ? <button type="button" className="secondary-button" onClick={() => { setEditingPayment(null); setPayment(emptyPayment) }}>Fechar edição</button> : null}
              </div> : <p className="muted-copy">{invoice.status === 'PAID' ? 'Pagamento registrado.' : 'Sem valores pendentes para pagar.'}</p>}
              {invoice.payments.length > 0 ? <details open={isEditing}><summary>Histórico de pagamentos</summary>{invoice.payments.map((record) => <div className="invoice-pay" key={record.id}>
                <p>{formatDate(record.date)} · {record.account?.name} · {formatCurrency(record.amount, user.currency)}{record.status === 'CANCELLED' ? ` · Cancelado em ${formatDate(record.updatedAt)}` : ''}</p>
                {record.status === 'COMPLETED' ? <>
                  <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => { setEditingPayment({ ...record, invoiceId: invoice.id }); setPayment({ accountId: record.accountId, date: record.date.slice(0, 10), amount: '' }) }}>Editar pagamento</button>
                  <button type="button" className="danger-action" disabled={isSubmitting} onClick={() => cancelPayment(invoice, record)}>Cancelar pagamento</button>
                </> : null}
              </div>)}</details> : null}
              <details><summary>Ver compras e parcelas</summary>{invoice.installments.map((item) => <p key={item.id}>{item.purchase.description} · {item.number}/{item.purchase.installmentsCount} · {formatCurrency(item.amount, user.currency)}</p>)}</details>
            </article>
          })}
        </div>}
      </section>
      <section className="movement-history"><div className="section-heading"><div><p className="eyebrow">Compras</p><h2>Compras da fatura selecionada</h2></div></div>{visiblePurchases.length === 0 ? <p className="muted-copy">Nenhuma compra nesta fatura.</p> : <div className="movement-list">{visiblePurchases.map((purchase) => <article className="movement-row" key={purchase.id}><span className="movement-symbol transfer">▣</span><div className="movement-info"><strong>{purchase.description}</strong><small>{purchase.category.name} · {purchase.installmentsCount}x · {formatDate(purchase.purchaseDate)}</small></div><div className="movement-value"><strong>{formatCurrency(purchase.installments.filter((item) => `${item.invoice.referenceYear}-${String(item.invoice.referenceMonth).padStart(2, '0')}` === invoiceMonth).reduce((total, item) => total + Number(item.amount), 0), user.currency)}</strong></div><div className="row-actions"><button type="button" className="danger-action" onClick={() => cancelPurchase(purchase)}>Cancelar</button></div></article>)}</div>}</section>
    </> : null}
  </section>
}
