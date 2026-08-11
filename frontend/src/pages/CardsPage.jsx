import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { accountService } from '../services/account.service.js'
import { cardService } from '../services/card.service.js'
import { categoryService } from '../services/category.service.js'
import { formatCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'

const today = new Date().toISOString().slice(0, 10)
const emptyCard = { name: '', institution: '', brand: '', type: 'CREDIT', creditLimit: '', closingDay: '25', dueDay: '5', color: '#263B71' }
const emptyPurchase = { categoryId: '', subcategoryId: '', description: '', merchant: '', totalAmount: '', purchaseDate: today, installmentsCount: '1', notes: '' }

function invoiceLabel(invoice) { return `${String(invoice.referenceMonth).padStart(2, '0')}/${invoice.referenceYear}` }
function formatDate(value) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value)) }

export function CardsPage() {
  const { user } = useAuth()
  const [cards, setCards] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [invoices, setInvoices] = useState([])
  const [purchases, setPurchases] = useState([])
  const [cardForm, setCardForm] = useState(emptyCard)
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchase)
  const [payment, setPayment] = useState({ accountId: '', categoryId: '', date: today, paymentMethod: 'PIX' })
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const selectedCard = cards.find((card) => card.id === selectedId)
  const expenseCategories = useMemo(() => categories.filter((item) => item.type === 'EXPENSE'), [categories])
  const selectedCategory = expenseCategories.find((item) => item.id === purchaseForm.categoryId)

  const loadDetail = useCallback(async (cardId) => {
    if (!cardId) { setInvoices([]); setPurchases([]); return }
    const [loadedInvoices, loadedPurchases] = await Promise.all([cardService.listInvoices(cardId), cardService.listPurchases(cardId)])
    setInvoices(loadedInvoices); setPurchases(loadedPurchases)
  }, [])
  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [loadedCards, loadedAccounts, loadedCategories] = await Promise.all([cardService.list('all'), accountService.list('active'), categoryService.list('active')])
      setCards(loadedCards); setAccounts(loadedAccounts); setCategories(loadedCategories)
      const nextId = selectedId && loadedCards.some((card) => card.id === selectedId) ? selectedId : loadedCards[0]?.id || ''
      setSelectedId(nextId)
      if (nextId) await loadDetail(nextId)
      setError('')
    } catch (requestError) { setError(getApiError(requestError)) } finally { setIsLoading(false) }
  }, [loadDetail, selectedId])
  useEffect(() => { load() }, [load])

  function changeCard(event) { setCardForm((current) => ({ ...current, [event.target.name]: event.target.value })) }
  function changePurchase(event) { const { name, value } = event.target; setPurchaseForm((current) => ({ ...current, [name]: value, ...(name === 'categoryId' ? { subcategoryId: '' } : {}) })) }
  async function chooseCard(id) { setSelectedId(id); try { await loadDetail(id) } catch (requestError) { setError(getApiError(requestError)) } }
  async function submitCard(event) {
    event.preventDefault(); setIsSubmitting(true); setError('')
    try {
      const card = await cardService.create({ ...cardForm, creditLimit: cardForm.type === 'CREDIT' ? cardForm.creditLimit : '0', closingDay: cardForm.type === 'CREDIT' ? Number(cardForm.closingDay) : null, dueDay: cardForm.type === 'CREDIT' ? Number(cardForm.dueDay) : null, institution: cardForm.institution || null, brand: cardForm.brand || null })
      setFormOpen(false); setCardForm(emptyCard); setSelectedId(card.id); await load()
    } catch (requestError) { setError(getApiError(requestError)) } finally { setIsSubmitting(false) }
  }
  async function submitPurchase(event) {
    event.preventDefault(); if (!selectedId) return; setIsSubmitting(true); setError('')
    try {
      await cardService.createPurchase(selectedId, { ...purchaseForm, subcategoryId: purchaseForm.subcategoryId || null, merchant: purchaseForm.merchant || null, notes: purchaseForm.notes || null, installmentsCount: Number(purchaseForm.installmentsCount) })
      setPurchaseForm((current) => ({ ...emptyPurchase, categoryId: current.categoryId, purchaseDate: today })); await load()
    } catch (requestError) { setError(getApiError(requestError)) } finally { setIsSubmitting(false) }
  }
  async function pay(invoice) {
    if (!payment.accountId || !payment.categoryId) { setError('Selecione a conta e a categoria para registrar o pagamento.'); return }
    if (!window.confirm(`Pagar a fatura ${invoiceLabel(invoice)} no valor de ${formatCurrency(invoice.totalAmount, user.currency)}?`)) return
    setIsSubmitting(true); setError('')
    try { await cardService.payInvoice(invoice.id, payment); await load() } catch (requestError) { setError(getApiError(requestError)) } finally { setIsSubmitting(false) }
  }
  async function cancelPurchase(purchase) {
    if (!window.confirm(`Cancelar a compra "${purchase.description}"?`)) return
    try { await cardService.cancelPurchase(purchase.id); await load() } catch (requestError) { setError(getApiError(requestError)) }
  }

  return <section className="page-stack">
    <div className="page-heading with-action"><div><p className="eyebrow">Fase 4 · Cartões</p><h1>Cartões e faturas</h1><p>Acompanhe limite, compras parceladas e pagamentos sem misturar fatura com saldo disponível.</p></div><button className="primary-button inline-button" type="button" onClick={() => setFormOpen(true)}>+ Novo cartão</button></div>
    {error ? <div className="form-alert" role="alert">{error}</div> : null}
    {formOpen ? <section className="editor-card"><div className="editor-heading"><div><p className="eyebrow">Novo cartão</p><h2>Dados do cartão</h2></div><button type="button" className="text-button" onClick={() => setFormOpen(false)}>Cancelar</button></div><form className="entity-form" onSubmit={submitCard}>
      <label className="form-field"><span>Nome</span><input name="name" value={cardForm.name} onChange={changeCard} required minLength="2" placeholder="Ex.: Nubank Platinum" /></label><label className="form-field"><span>Banco</span><input name="institution" value={cardForm.institution} onChange={changeCard} placeholder="Opcional" /></label>
      <label className="form-field"><span>Tipo</span><select name="type" value={cardForm.type} onChange={changeCard}><option value="CREDIT">Crédito</option><option value="DEBIT">Débito</option></select></label><label className="form-field"><span>Bandeira</span><input name="brand" value={cardForm.brand} onChange={changeCard} placeholder="Ex.: Visa" /></label>
      {cardForm.type === 'CREDIT' ? <><label className="form-field"><span>Limite</span><input name="creditLimit" value={cardForm.creditLimit} onChange={changeCard} required inputMode="decimal" placeholder="0.00" /></label><label className="form-field"><span>Dia de fechamento</span><input name="closingDay" value={cardForm.closingDay} onChange={changeCard} required type="number" min="1" max="31" /></label><label className="form-field"><span>Dia de vencimento</span><input name="dueDay" value={cardForm.dueDay} onChange={changeCard} required type="number" min="1" max="31" /></label></> : null}
      <label className="form-field color-field"><span>Cor</span><input name="color" value={cardForm.color} onChange={changeCard} type="color" /></label><button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar cartão'}</button>
    </form></section> : null}
    {isLoading ? <p className="loading-inline">Carregando cartões...</p> : null}
    {!isLoading && cards.length === 0 ? <EmptyState title="Nenhum cartão cadastrado" description="Adicione seus cartões de crédito para acompanhar limites e faturas." action={<button className="primary-button inline-button" onClick={() => setFormOpen(true)}>Cadastrar cartão</button>} /> : null}
    {!isLoading && cards.length > 0 ? <div className="card-selector">{cards.map((card) => <button type="button" className={`credit-card ${card.id === selectedId ? 'is-selected' : ''} ${card.isActive ? '' : 'is-inactive'}`} key={card.id} onClick={() => chooseCard(card.id)} style={{ '--card-color': card.color || '#263B71' }}><span>{card.brand || (card.type === 'CREDIT' ? 'CRÉDITO' : 'DÉBITO')}</span><strong>{card.name}</strong>{card.type === 'CREDIT' ? <small>Disponível: {formatCurrency(card.availableLimit, user.currency)} de {formatCurrency(card.creditLimit, user.currency)}</small> : <small>Cartão de débito</small>}</button>)}</div> : null}
    {selectedCard?.type === 'CREDIT' ? <>
      <section className="limit-summary"><article><span>Limite utilizado</span><strong>{formatCurrency(selectedCard.usedLimit, user.currency)}</strong></article><article><span>Limite disponível</span><strong>{formatCurrency(selectedCard.availableLimit, user.currency)}</strong></article><article><span>Fechamento / vencimento</span><strong>Dia {selectedCard.closingDay} / {selectedCard.dueDay}</strong></article></section>
      <section className="editor-card"><div className="editor-heading"><div><p className="eyebrow">Nova compra</p><h2>Adicionar ao cartão</h2></div></div><form className="entity-form" onSubmit={submitPurchase}>
        <label className="form-field"><span>Descrição</span><input name="description" value={purchaseForm.description} onChange={changePurchase} required minLength="2" placeholder="Ex.: Notebook" /></label><label className="form-field"><span>Estabelecimento</span><input name="merchant" value={purchaseForm.merchant} onChange={changePurchase} placeholder="Opcional" /></label><label className="form-field"><span>Valor total</span><input name="totalAmount" value={purchaseForm.totalAmount} onChange={changePurchase} required inputMode="decimal" placeholder="0.00" /></label><label className="form-field"><span>Data da compra</span><input name="purchaseDate" value={purchaseForm.purchaseDate} onChange={changePurchase} required type="date" /></label><label className="form-field"><span>Parcelas</span><input name="installmentsCount" value={purchaseForm.installmentsCount} onChange={changePurchase} required type="number" min="1" max="120" /></label><label className="form-field"><span>Categoria</span><select name="categoryId" value={purchaseForm.categoryId} onChange={changePurchase} required><option value="">Selecione</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>{selectedCategory?.subcategories?.length ? <label className="form-field"><span>Subcategoria</span><select name="subcategoryId" value={purchaseForm.subcategoryId} onChange={changePurchase}><option value="">Sem subcategoria</option>{selectedCategory.subcategories.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}<label className="form-field form-field-wide"><span>Observações</span><input name="notes" value={purchaseForm.notes} onChange={changePurchase} placeholder="Opcional" /></label><button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Adicionando...' : 'Adicionar compra'}</button>
      </form></section>
      <section className="movement-history"><div className="section-heading"><div><p className="eyebrow">Faturas</p><h2>Próximos pagamentos</h2></div></div>{invoices.length === 0 ? <EmptyState title="Sem faturas" description="As compras aparecerão organizadas por fatura." /> : <div className="invoice-list">{invoices.map((invoice) => <article className="invoice-card" key={invoice.id}><div><span className={`status-tag status-${invoice.effectiveStatus.toLowerCase()}`}>{invoice.effectiveStatus === 'PAID' ? 'Paga' : invoice.effectiveStatus === 'CLOSED' ? 'Fechada' : 'Aberta'}</span><h3>Fatura {invoiceLabel(invoice)}</h3><small>Vence em {formatDate(invoice.dueDate)} · {invoice.installments.length} lançamento(s)</small></div><strong>{formatCurrency(invoice.totalAmount, user.currency)}</strong>{invoice.status !== 'PAID' ? <div className="invoice-pay"><select value={payment.accountId} onChange={(event) => setPayment((current) => ({ ...current, accountId: event.target.value }))}><option value="">Conta de pagamento</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><select value={payment.categoryId} onChange={(event) => setPayment((current) => ({ ...current, categoryId: event.target.value }))}><option value="">Categoria do pagamento</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button type="button" className="primary-button inline-button" disabled={isSubmitting} onClick={() => pay(invoice)}>Pagar</button></div> : null}<details><summary>Ver compras e parcelas</summary>{invoice.installments.map((item) => <p key={item.id}>{item.purchase.description} · {item.number}/{item.purchase.installmentsCount} · {formatCurrency(item.amount, user.currency)}</p>)}</details></article>)}</div>}</section>
      <section className="movement-history"><div className="section-heading"><div><p className="eyebrow">Compras</p><h2>Compras no cartão</h2></div></div>{purchases.length === 0 ? <p className="muted-copy">Nenhuma compra registrada neste cartão.</p> : <div className="movement-list">{purchases.map((purchase) => <article className="movement-row" key={purchase.id}><span className="movement-symbol transfer">▣</span><div className="movement-info"><strong>{purchase.description}</strong><small>{purchase.category.name} · {purchase.installmentsCount}x · {formatDate(purchase.purchaseDate)}</small></div><div className="movement-value"><strong>{formatCurrency(purchase.totalAmount, user.currency)}</strong></div><div className="row-actions"><button type="button" className="danger-action" onClick={() => cancelPurchase(purchase)}>Cancelar</button></div></article>)}</div>}</section>
    </> : null}
  </section>
}
