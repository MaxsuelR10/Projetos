import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { accountService } from '../services/account.service.js'
import { categoryService } from '../services/category.service.js'
import { transactionService } from '../services/transaction.service.js'
import { transferService } from '../services/transfer.service.js'
import { cardService } from '../services/card.service.js'
import { formatCurrency, parseCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'
import { CurrencyInput } from '../components/forms/CurrencyInput.jsx'
import { CategorySelect } from '../components/forms/CategorySelect.jsx'
import { useConfirm } from '../hooks/useConfirm.js'
import { useToast } from '../hooks/useToast.js'
import { ActionMenu } from '../components/actions/ActionMenu.jsx'
import { ConfirmModal } from '../components/feedback/ConfirmModal.jsx'
import { notifyFinancialDataChanged } from '../utils/financial-events.js'

const today = new Date().toISOString().slice(0, 10)
const initialMovement = {
  type: 'EXPENSE',
  accountId: '',
  categoryId: '',
  subcategoryId: '',
  creditCardId: null,
  purchaseType: 'ONE_TIME',
  installmentsCount: '2',
  description: '',
  amount: '',
  date: today,
  dueDate: '',
  status: 'PENDING',
  paymentMethod: 'PIX',
  notes: '',
}
const initialTransfer = { fromAccountId: '', toAccountId: '', amount: '', date: today, description: '' }
const paymentMethods = [
  ['PIX', 'PIX'],
  ['CREDIT_CARD', 'Cartão de crédito'],
  ['DEBIT_CARD', 'Cartão de débito'],
  ['BOLETO', 'Boleto'],
  ['CASH', 'Dinheiro'],
  ['BANK_TRANSFER', 'Transferência bancária'],
  ['AUTOMATIC_DEBIT', 'Débito automático'],
  ['OTHER', 'Outro'],
]

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value)) : 'Não informado'
}

function getStatusInfo(item) {
  const isExpense = item.type === 'EXPENSE'
  if (item.status === 'COMPLETED') {
    return { label: isExpense ? 'Pago' : 'Recebido', className: 'status-completed' }
  }
  if (item.status === 'OVERDUE') {
    return { label: 'Em atraso', className: 'status-overdue' }
  }
  if (item.status === 'CANCELLED') {
    return { label: 'Cancelado', className: 'status-cancelled' }
  }
  return { label: isExpense ? 'Aberto' : 'A receber', className: 'status-pending' }
}

function paymentMethodLabel(value) {
  return paymentMethods.find(([method]) => method === value)?.[1] || 'Não informado'
}

export function TransactionsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const requestConfirmation = useConfirm()
  const [mode, setMode] = useState('movement')
  const [movement, setMovement] = useState(initialMovement)
  const [transfer, setTransfer] = useState(initialTransfer)
  const [data, setData] = useState({ accounts: [], cards: [], categories: [], transactions: [], transfers: [] })
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [cardFilter, setCardFilter] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [sortFilter, setSortFilter] = useState('DATE_DESC')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [editingMovement, setEditingMovement] = useState(null)
  const [payingItem, setPayingItem] = useState(null)
  const [payAccount, setPayAccount] = useState('')
  const [payDate, setPayDate] = useState(today)
  const [details, setDetails] = useState(null)
  const [transferDetails, setTransferDetails] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [pendingAction, setPendingAction] = useState('')
  const loadRequestRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current
    setIsLoading(true)
    try {
      const [accounts, cards, categories, transactionResult, transfers] = await Promise.all([
        accountService.list('active'),
        cardService.list('active'),
        categoryService.list('active'),
        transactionService.list({
          page,
          limit: 30,
          ...(typeFilter !== 'ALL' ? { type: typeFilter } : {}),
          ...(statusFilter !== 'ALL' ? { state: statusFilter } : {}),
          ...(categoryFilter ? { categoryId: categoryFilter } : {}),
          ...(accountFilter ? { accountId: accountFilter } : {}),
          ...(cardFilter ? { creditCardId: cardFilter } : {}),
          ...(paymentMethodFilter ? { paymentMethod: paymentMethodFilter } : {}),
          ...(fromFilter ? { from: fromFilter } : {}),
          ...(toFilter ? { to: toFilter } : {}),
          ...(debouncedSearchTerm ? { q: debouncedSearchTerm } : {}),
          sort: sortFilter,
        }),
        transferService.list({
          ...(accountFilter ? { accountId: accountFilter } : {}),
          ...(fromFilter ? { from: fromFilter } : {}),
          ...(toFilter ? { to: toFilter } : {}),
        }),
      ])
      if (requestId !== loadRequestRef.current) return
      setData({ accounts, cards, categories, transactions: transactionResult.transactions, transfers })
      setPagination(transactionResult.pagination)
      setError('')
    } catch (requestError) {
      if (requestId !== loadRequestRef.current) return
      setError(getApiError(requestError))
    } finally {
      if (requestId === loadRequestRef.current) setIsLoading(false)
    }
  }, [accountFilter, cardFilter, categoryFilter, debouncedSearchTerm, fromFilter, page, paymentMethodFilter, sortFilter, statusFilter, toFilter, typeFilter])

  useEffect(() => {
    const timerId = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timerId)
  }, [load])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchTerm])

  const usableCategories = useMemo(
    () => data.categories.filter((category) => category.type === movement.type),
    [data.categories, movement.type],
  )
  const selectedCategory = usableCategories.find((category) => category.id === movement.categoryId)
  const creditCards = useMemo(() => data.cards.filter((card) => card.type === 'CREDIT' && card.isActive), [data.cards])

  const filteredTransactions = data.transactions

  const availablePaymentMethods =
    movement.type === 'EXPENSE' ? paymentMethods : paymentMethods.filter(([value]) => value !== 'CREDIT_CARD')

  function changeMovement(event) {
    const { name, value } = event.target
    setMovement((current) => {
      const next = { ...current, [name]: value }
      if (name === 'type') {
        next.categoryId = ''
        next.subcategoryId = ''
        if (value === 'INCOME') {
          next.paymentMethod = 'PIX'
          next.creditCardId = null
          next.purchaseType = 'ONE_TIME'
          next.installmentsCount = ''
          next.status = 'PENDING'
        } else {
          next.status = 'PENDING'
        }
      }
      if (name === 'categoryId') next.subcategoryId = ''
      if (name === 'paymentMethod') {
        next.creditCardId = null
        next.purchaseType = 'ONE_TIME'
        next.installmentsCount = value === 'CREDIT_CARD' ? '2' : ''
        if (value === 'CREDIT_CARD') next.status = 'COMPLETED'
      }
      return next
    })
  }

  function changeTransfer(event) {
    setTransfer((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function refreshFinancialData() {
    notifyFinancialDataChanged()
    await load()
  }

  function clearFilters() {
    setTypeFilter('ALL')
    setStatusFilter('ALL')
    setSearchTerm('')
    setDebouncedSearchTerm('')
    setCategoryFilter('')
    setAccountFilter('')
    setCardFilter('')
    setPaymentMethodFilter('')
    setFromFilter('')
    setToFilter('')
    setSortFilter('DATE_DESC')
    setPage(1)
  }

  const hasActiveFilters = typeFilter !== 'ALL' || statusFilter !== 'ALL' || Boolean(searchTerm || categoryFilter || accountFilter || cardFilter || paymentMethodFilter || fromFilter || toFilter || sortFilter !== 'DATE_DESC')

  function closeMovementEditor() {
    setEditingMovement(null)
    setMovement((current) => ({ ...initialMovement, type: current.type, accountId: current.accountId, date: today }))
  }

  function openMovementEditor(item) {
    if (item.cardPurchaseId) {
      setError('Para preservar as parcelas, compras no cartão devem ser alteradas pela tela de Cartões.')
      return
    }
    setMode('movement')
    setEditingMovement(item)
    setMovement({
      type: item.type,
      accountId: item.accountId,
      categoryId: item.categoryId,
      subcategoryId: item.subcategoryId || '',
      creditCardId: null,
      purchaseType: 'ONE_TIME',
      installmentsCount: '',
      description: item.description,
      amount: item.amount,
      date: item.date.slice(0, 10),
      dueDate: item.dueDate?.slice(0, 10) || '',
      status: item.status,
      paymentMethod: item.paymentMethod || 'PIX',
      notes: item.notes || '',
    })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function openDetails(item) {
    try {
      setDetails(await transactionService.get(item.id))
      setError('')
    } catch (requestError) {
      setError(getApiError(requestError))
    }
  }

  async function submitMovement(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      if (movement.paymentMethod === 'CREDIT_CARD' && !movement.creditCardId) {
        setError('Selecione o cartão de crédito utilizado.')
        setIsSubmitting(false)
        return
      }
      const isCreditCard = movement.paymentMethod === 'CREDIT_CARD'
      const { purchaseType, installmentsCount, creditCardId, ...transaction } = movement
      const payload = {
        ...transaction,
        amount: parseCurrency(movement.amount),
        accountId: movement.accountId || null,
        subcategoryId: movement.subcategoryId || null,
        dueDate: movement.dueDate || null,
        paymentMethod: movement.paymentMethod || null,
        notes: movement.notes || null,
        ...(isCreditCard
          ? { creditCardId, installmentsCount: purchaseType === 'INSTALLMENT' ? Number(installmentsCount) : 1 }
          : {}),
      }
      if (editingMovement) {
        await transactionService.update(editingMovement.id, payload)
        toast.success('Movimentação atualizada.')
      } else {
        await transactionService.create(payload)
        toast.success('Movimentação registrada.')
      }
      closeMovementEditor()
      await refreshFinancialData()
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitTransfer(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      await transferService.create({
        ...transfer,
        amount: parseCurrency(transfer.amount),
        description: transfer.description || null,
        idempotencyKey: crypto.randomUUID(),
      })
      setTransfer((current) => ({ ...initialTransfer, fromAccountId: current.fromAccountId, date: today }))
      toast.success('Transferência realizada com sucesso.')
      await refreshFinancialData()
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  function startPayment(item) {
    setPayingItem(item)
    setPayAccount(item.paymentMethod === 'CASH' ? '' : item.accountId || data.accounts[0]?.id || '')
    setPayDate(today)
    setError('')
  }

  async function confirmPayment() {
    if (!payingItem) return
    setIsSubmitting(true)
    setError('')
    try {
      await transactionService.pay(payingItem.id, {
        accountId: payAccount || null,
        date: payDate,
      })
      toast.success(
        payingItem.type === 'EXPENSE'
          ? `Pagamento de ${formatCurrency(payingItem.amount, user.currency)} concluído!`
          : `Recebimento de ${formatCurrency(payingItem.amount, user.currency)} registrado!`,
      )
      setPayingItem(null)
      if (details?.id === payingItem.id) setDetails(null)
      await refreshFinancialData()
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function cancel(item) {
    if (!(await requestConfirmation({ title: 'Cancelar lançamento?', message: `O lançamento “${item.description}” será cancelado e continuará disponível no histórico.`, confirmLabel: 'Cancelar lançamento', destructive: true, icon: '!' }))) return
    const actionKey = `cancel:${item.id}`
    if (pendingAction) return
    setPendingAction(actionKey)
    try {
      await transactionService.cancel(item.id)
      toast.success('Movimentação cancelada e preservada no histórico.')
      if (details?.id === item.id) setDetails(null)
      await refreshFinancialData()
    } catch (requestError) {
      setError(getApiError(requestError))
      toast.error('Não foi possível cancelar esta movimentação.')
    } finally {
      setPendingAction('')
    }
  }

  async function remove(item) {
    const actionKey = `delete:${item.id}`
    if (pendingAction) return
    setPendingAction(actionKey)
    try {
      await transactionService.remove(item.id)
      toast.success(item.status === 'COMPLETED' ? 'Movimentação cancelada e preservada no histórico.' : 'Movimentação excluída.')
      if (details?.id === item.id) setDetails(null)
      setDeleteTarget(null)
      await refreshFinancialData()
    } catch (requestError) {
      setError(getApiError(requestError))
      toast.error('Não foi possível excluir esta movimentação.')
    } finally {
      setPendingAction('')
    }
  }

  async function reverse(item) {
    if (!(await requestConfirmation({ title: 'Estornar transferência?', message: `A transferência de ${formatCurrency(item.amount, user.currency)} será revertida nas duas contas.`, confirmLabel: 'Estornar transferência', destructive: true, icon: '!' }))) return
    const actionKey = `reverse:${item.id}`
    if (pendingAction) return
    setPendingAction(actionKey)
    try {
      await transferService.reverse(item.id)
      toast.success('Transferência estornada com sucesso.')
      if (transferDetails?.id === item.id) setTransferDetails(null)
      await refreshFinancialData()
    } catch (requestError) {
      setError(getApiError(requestError))
      toast.error('Não foi possível estornar a transferência.')
    } finally {
      setPendingAction('')
    }
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Movimentações · Entradas e Saídas</p>
          <h1>Registre seu dinheiro</h1>
          <p>Lançar receitas, despesas e transferências de forma rápida e segura.</p>
        </div>
      </div>

      {error ? <div className="form-alert" role="alert">{error}</div> : null}

      {/* Modal / Card de Pagamento Rápido */}
      {payingItem ? (
        <section className="editor-card pay-modal-card" aria-labelledby="pay-title">
          <div className="editor-heading">
            <div>
              <p className="eyebrow">Confirmar {payingItem.type === 'EXPENSE' ? 'Pagamento' : 'Recebimento'}</p>
              <h2 id="pay-title">{payingItem.description} — {formatCurrency(payingItem.amount, user.currency)}</h2>
            </div>
            <button className="text-button" type="button" onClick={() => setPayingItem(null)}>
              Cancelar
            </button>
          </div>
          <div className="entity-form">
            {payingItem.paymentMethod === 'CASH' ? (
              <p className="form-help form-field-wide">Pagamento em dinheiro: será marcado como pago sem movimentar uma conta bancária.</p>
            ) : (
              <label className="form-field">
                <span>Conta de {payingItem.type === 'EXPENSE' ? 'débito' : 'crédito'}</span>
                <select value={payAccount} onChange={(e) => setPayAccount(e.target.value)} required>
                  <option value="">Selecione a conta</option>
                  {data.accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({formatCurrency(acc.currentBalance, user.currency)})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-field">
              <span>Data do {payingItem.type === 'EXPENSE' ? 'pagamento' : 'recebimento'}</span>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
            </label>
            <div className="card-actions-modal">
              <button
                className="primary-button inline-button"
                type="button"
                disabled={isSubmitting || (payingItem.paymentMethod !== 'CASH' && !payAccount)}
                onClick={confirmPayment}
              >
                {isSubmitting
                  ? 'Confirmando...'
                  : `Confirmar ${payingItem.type === 'EXPENSE' ? 'Pagamento' : 'Recebimento'}`}
              </button>
              <button className="text-button" type="button" onClick={() => setPayingItem(null)}>
                Voltar
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* Seletor de Modo: Movimentação vs Transferência */}
      <div className="segmented-control transaction-mode" aria-label="Tipo de lançamento">
        <button
          type="button"
          className={mode === 'movement' ? 'is-selected' : ''}
          onClick={() => setMode('movement')}
        >
          Receita ou despesa
        </button>
        <button
          type="button"
          className={mode === 'transfer' ? 'is-selected' : ''}
          onClick={() => setMode('transfer')}
        >
          Transferir entre contas
        </button>
      </div>

      {/* Formulário de Movimentação */}
      {mode === 'movement' ? (
        <section className="editor-card">
          {editingMovement ? (
            <div className="editor-heading">
              <div>
                <p className="eyebrow">Editar lançamento</p>
                <h2>{editingMovement.description}</h2>
              </div>
              <button className="text-button" type="button" onClick={closeMovementEditor}>
                Cancelar edição
              </button>
            </div>
          ) : null}
          <form className="entity-form" onSubmit={submitMovement}>
            <div className="segmented-control compact-segmented">
              <button
                type="button"
                className={`expense ${movement.type === 'EXPENSE' ? 'is-selected' : ''}`}
                onClick={() =>
                  setMovement((current) => ({
                    ...current,
                    type: 'EXPENSE',
                    categoryId: '',
                    subcategoryId: '',
                    status: 'PENDING',
                  }))
                }
              >
                Despesa
              </button>
              <button
                type="button"
                className={`income ${movement.type === 'INCOME' ? 'is-selected' : ''}`}
                onClick={() =>
                  setMovement((current) => ({
                    ...current,
                    type: 'INCOME',
                    categoryId: '',
                    subcategoryId: '',
                    paymentMethod: 'PIX',
                    creditCardId: null,
                    purchaseType: 'ONE_TIME',
                    installmentsCount: '',
                    status: 'PENDING',
                  }))
                }
              >
                Receita
              </button>
            </div>

            <label className="form-field">
              <span>Descrição</span>
              <input
                name="description"
                value={movement.description}
                onChange={changeMovement}
                required
                minLength="2"
                maxLength="180"
                placeholder={movement.type === 'INCOME' ? 'Ex.: Salário, Venda' : 'Ex.: Mercado, Luz, Aluguel'}
              />
            </label>

            <label className="form-field">
              <span>Valor</span>
              <CurrencyInput name="amount" value={movement.amount} onChange={changeMovement} required />
            </label>

            <label className="form-field">
              <span>Conta</span>
              <select name="accountId" value={movement.accountId} onChange={changeMovement} required={!(movement.type === 'EXPENSE' && movement.paymentMethod === 'CASH')}>
                <option value="">{movement.type === 'EXPENSE' && movement.paymentMethod === 'CASH' ? 'Sem conta bancária' : 'Selecione a conta'}</option>
                {data.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({formatCurrency(account.currentBalance, user.currency)})
                  </option>
                ))}
              </select>
            </label>

            {movement.type === 'EXPENSE' && movement.paymentMethod === 'CASH' ? (
              <p className="form-help form-field-wide">Dinheiro não exige conta bancária. Se escolher uma conta do tipo “Dinheiro”, o saldo dela será atualizado ao pagar.</p>
            ) : null}

            <label className="form-field">
              <span>Categoria</span>
              <CategorySelect value={movement.categoryId} options={usableCategories} onChange={changeMovement} />
            </label>

            {selectedCategory?.subcategories?.length ? (
              <label className="form-field">
                <span>Subcategoria</span>
                <select name="subcategoryId" value={movement.subcategoryId} onChange={changeMovement}>
                  <option value="">Sem subcategoria</option>
                  {selectedCategory.subcategories
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}

            <label className="form-field">
              <span>Data</span>
              <input name="date" value={movement.date} onChange={changeMovement} type="date" required />
            </label>

            <label className="form-field">
              <span>Vencimento (opcional)</span>
              <input name="dueDate" value={movement.dueDate} onChange={changeMovement} type="date" />
            </label>

            {editingMovement ? (
              <p className="form-help form-field-wide">A situação financeira é alterada somente pelas ações Pagar, Receber ou Cancelar.</p>
            ) : movement.paymentMethod === 'CREDIT_CARD' ? (
              <p className="form-help form-field-wide">
                💳 Compra no cartão: consome limite e é alocada na fatura. O saldo bancário só é debitado no pagamento da fatura.
              </p>
            ) : (
              <label className="form-field">
                <span>Situação</span>
                <select name="status" value={movement.status} onChange={changeMovement}>
                  {movement.type === 'EXPENSE' ? (
                    <>
                      <option value="PENDING">Aberto (a pagar — não desconta saldo ainda)</option>
                      <option value="COMPLETED">Pago (já pago — desconta do saldo agora)</option>
                      <option value="OVERDUE">Em atraso (não desconta saldo ainda)</option>
                    </>
                  ) : (
                    <>
                      <option value="COMPLETED">Recebido (já na conta — soma no saldo)</option>
                      <option value="PENDING">A receber (previsto — não soma no saldo ainda)</option>
                      <option value="OVERDUE">Em atraso (previsto)</option>
                    </>
                  )}
                </select>
              </label>
            )}

            <label className="form-field">
              <span>Forma de pagamento</span>
              <select name="paymentMethod" value={movement.paymentMethod} onChange={changeMovement}>
                {availablePaymentMethods.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {movement.paymentMethod === 'CREDIT_CARD' ? (
              <>
                <label className="form-field">
                  <span>Cartão utilizado</span>
                  {creditCards.length ? (
                    <select
                      name="creditCardId"
                      value={movement.creditCardId || ''}
                      onChange={changeMovement}
                      required
                    >
                      <option value="">Selecione o cartão</option>
                      {creditCards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <small className="form-help">
                      Você ainda não possui cartões cadastrados. <Link to="/cartoes">Cadastrar cartão</Link>
                    </small>
                  )}
                </label>
                <label className="form-field">
                  <span>Tipo da compra</span>
                  <select name="purchaseType" value={movement.purchaseType} onChange={changeMovement}>
                    <option value="ONE_TIME">À vista</option>
                    <option value="INSTALLMENT">Parcelada</option>
                  </select>
                </label>
                {movement.purchaseType === 'INSTALLMENT' ? (
                  <label className="form-field">
                    <span>Número de parcelas</span>
                    <input
                      name="installmentsCount"
                      value={movement.installmentsCount}
                      onChange={changeMovement}
                      required
                      type="number"
                      min="2"
                      max="120"
                      step="1"
                      inputMode="numeric"
                    />
                  </label>
                ) : null}
              </>
            ) : null}

            <label className="form-field form-field-wide">
              <span>Observações</span>
              <input
                name="notes"
                value={movement.notes}
                onChange={changeMovement}
                maxLength="5000"
                placeholder="Opcional"
              />
            </label>

            <button
              className="primary-button"
              type="submit"
              disabled={isSubmitting || (!data.accounts.length && !(movement.type === 'EXPENSE' && movement.paymentMethod === 'CASH'))}
            >
              {isSubmitting ? 'Salvando...' : editingMovement ? 'Salvar alterações' : 'Salvar lançamento'}
            </button>
          </form>
        </section>
      ) : (
        /* Formulário de Transferência */
        <section className="editor-card">
          <form className="entity-form" onSubmit={submitTransfer}>
            <label className="form-field">
              <span>Conta de origem</span>
              <select name="fromAccountId" value={transfer.fromAccountId} onChange={changeTransfer} required>
                <option value="">Selecione</option>
                {data.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({formatCurrency(account.currentBalance, user.currency)})
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Conta de destino</span>
              <select name="toAccountId" value={transfer.toAccountId} onChange={changeTransfer} required>
                <option value="">Selecione</option>
                {data.accounts
                  .filter((account) => account.id !== transfer.fromAccountId)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({formatCurrency(account.currentBalance, user.currency)})
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field">
              <span>Valor</span>
              <CurrencyInput name="amount" value={transfer.amount} onChange={changeTransfer} required />
            </label>
            <label className="form-field">
              <span>Data</span>
              <input name="date" value={transfer.date} onChange={changeTransfer} type="date" required />
            </label>
            <label className="form-field form-field-wide">
              <span>Descrição</span>
              <input
                name="description"
                value={transfer.description}
                onChange={changeTransfer}
                maxLength="180"
                placeholder="Ex.: Reserva mensal, Aplicação"
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={isSubmitting || data.accounts.length < 2}
            >
              {isSubmitting ? 'Transferindo...' : 'Confirmar transferência'}
            </button>
          </form>
        </section>
      )}

      {/* Detalhes do Lançamento */}
      {details ? (
        <section className="editor-card" aria-labelledby="transaction-details-title">
          <div className="editor-heading">
            <div>
              <p className="eyebrow">Detalhes do lançamento</p>
              <h2 id="transaction-details-title">{details.description}</h2>
            </div>
            <button className="text-button" type="button" onClick={() => setDetails(null)}>
              Fechar
            </button>
          </div>
          <dl className="details-grid">
            <div>
              <dt>Tipo</dt>
              <dd className={details.type === 'INCOME' ? 'income-text' : 'expense-text'}>
                {details.type === 'INCOME' ? 'Receita' : 'Despesa'}
              </dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>
                <strong>{formatCurrency(details.amount, user.currency)}</strong>
              </dd>
            </div>
            <div>
              <dt>Conta</dt>
              <dd>{details.account?.name}</dd>
            </div>
            <div>
              <dt>Categoria</dt>
              <dd>
                {details.category?.name}
                {details.subcategory ? ` · ${details.subcategory.name}` : ''}
              </dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>{formatDate(details.date)}</dd>
            </div>
            <div>
              <dt>Vencimento</dt>
              <dd>{details.dueDate ? formatDate(details.dueDate) : 'Não informado'}</dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd>
                <span className={`status-tag ${getStatusInfo(details).className}`}>
                  {getStatusInfo(details).label}
                </span>
              </dd>
            </div>
            <div>
              <dt>Forma de pagamento</dt>
              <dd>{paymentMethodLabel(details.paymentMethod)}</dd>
            </div>
            {details.settledAt ? (
              <div>
                <dt>Data de pagamento</dt>
                <dd>{formatDate(details.settledAt)}</dd>
              </div>
            ) : null}
            {details.creditCard ? (
              <div>
                <dt>Cartão vinculado</dt>
                <dd>{details.creditCard.name}</dd>
              </div>
            ) : null}
            {details.recurringTransaction ? (
              <div>
                <dt>Recorrência</dt>
                <dd>Gerado por uma recorrência ({details.recurringTransaction.frequency})</dd>
              </div>
            ) : null}
          </dl>
          {details.notes ? (
            <p className="detail-notes">
              <strong>Observações:</strong>
              <br />
              {details.notes}
            </p>
          ) : null}
          {details.cardPurchase ? (
            <section className="detail-installments">
              <strong>Parcelamento: {details.cardPurchase.installmentsCount}x</strong>
              <div className="detail-installment-list">
                {details.cardPurchase.installments.map((installment) => (
                  <span key={installment.id}>
                    {installment.number}ª parcela · {formatCurrency(installment.amount, user.currency)} · Vence em{' '}
                    {formatDate(installment.dueDate)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
          {details.recurringTransaction ? <p className="form-help">Alterações nesta ocorrência não modificam a regra. <Link to="/recorrencias">Gerenciar recorrência</Link></p> : null}

          {/* Ação rápida de pagar direto dos detalhes se estiver aberto */}
          {details.status !== 'COMPLETED' && details.status !== 'CANCELLED' && !details.cardPurchaseId ? (
            <div className="detail-actions-footer">
              <button
                className="primary-button inline-button"
                type="button"
                onClick={() => startPayment(details)}
              >
                {details.type === 'EXPENSE' ? '💳 Pagar agora' : '💰 Receber agora'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {transferDetails ? (
        <section className="editor-card" aria-labelledby="transfer-details-title">
          <div className="editor-heading">
            <div><p className="eyebrow">Detalhes da transferência</p><h2 id="transfer-details-title">{transferDetails.fromAccount.name} → {transferDetails.toAccount.name}</h2></div>
            <button className="text-button" type="button" onClick={() => setTransferDetails(null)}>Fechar</button>
          </div>
          <dl className="details-grid">
            <div><dt>Conta de origem</dt><dd>{transferDetails.fromAccount.name}</dd></div>
            <div><dt>Conta de destino</dt><dd>{transferDetails.toAccount.name}</dd></div>
            <div><dt>Valor</dt><dd><strong>{formatCurrency(transferDetails.amount, user.currency)}</strong></dd></div>
            <div><dt>Data</dt><dd>{formatDate(transferDetails.date)}</dd></div>
            <div><dt>Situação</dt><dd><span className={`status-tag ${transferDetails.isReversed ? 'status-cancelled' : 'status-completed'}`}>{transferDetails.isReversed ? 'Estornada' : 'Concluída'}</span></dd></div>
          </dl>
          {transferDetails.description ? <p className="detail-notes"><strong>Descrição:</strong><br />{transferDetails.description}</p> : null}
          {!transferDetails.isReversed ? <div className="detail-actions-footer"><button className="danger-button inline-button" type="button" disabled={Boolean(pendingAction)} onClick={() => reverse(transferDetails)}>{pendingAction === `reverse:${transferDetails.id}` ? 'Estornando...' : 'Estornar transferência'}</button></div> : null}
        </section>
      ) : null}

      {/* Histórico e Filtros Inteligentes */}
      <section className="movement-history">
        <div className="section-heading-with-filters">
          <div>
            <p className="eyebrow">Extrato e Gestão</p>
            <h2>Histórico de Movimentações</h2>
          </div>

          <div className="movement-filters-bar">
            {/* Filtro por Tipo */}
            <div className="history-filter">
              <button
                type="button"
                className={typeFilter === 'ALL' ? 'is-selected' : ''}
                onClick={() => { setTypeFilter('ALL'); setPage(1) }}
              >
                Todas
              </button>
              <button
                type="button"
                className={typeFilter === 'EXPENSE' ? 'is-selected expense' : ''}
                onClick={() => { setTypeFilter('EXPENSE'); setPage(1) }}
              >
                Despesas
              </button>
              <button
                type="button"
                className={typeFilter === 'INCOME' ? 'is-selected income' : ''}
                onClick={() => { setTypeFilter('INCOME'); setPage(1) }}
              >
                Receitas
              </button>
            </div>

            {/* Filtro por Situação */}
            <div className="history-filter">
              <button
                type="button"
                className={statusFilter === 'ALL' ? 'is-selected' : ''}
                onClick={() => { setStatusFilter('ALL'); setPage(1) }}
              >
                Todos os status
              </button>
              <button
                type="button"
                className={statusFilter === 'OPEN' ? 'is-selected is-pending-filter' : ''}
                onClick={() => { setStatusFilter('OPEN'); setPage(1) }}
              >
                {typeFilter === 'EXPENSE' ? 'Abertas' : typeFilter === 'INCOME' ? 'A receber' : 'Pendentes'}
              </button>
              <button
                type="button"
                className={statusFilter === 'SETTLED' ? 'is-selected is-settled-filter' : ''}
                onClick={() => { setStatusFilter('SETTLED'); setPage(1) }}
              >
                {typeFilter === 'EXPENSE' ? 'Pagas' : typeFilter === 'INCOME' ? 'Recebidas' : 'Concluídas'}
              </button>
              <button
                type="button"
                className={statusFilter === 'CANCELLED' ? 'is-selected' : ''}
                onClick={() => { setStatusFilter('CANCELLED'); setPage(1) }}
              >
                Canceladas
              </button>
            </div>

            <div className="advanced-filters" aria-label="Filtros avançados">
              <label><span>Período de</span><input type="date" value={fromFilter} onChange={(event) => { setFromFilter(event.target.value); setPage(1) }} /></label>
              <label><span>até</span><input type="date" value={toFilter} min={fromFilter || undefined} onChange={(event) => { setToFilter(event.target.value); setPage(1) }} /></label>
              <label><span>Categoria</span><select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1) }}><option value="">Todas</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label><span>Conta</span><select value={accountFilter} onChange={(event) => { setAccountFilter(event.target.value); setPage(1) }}><option value="">Todas</option>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
              <label><span>Cartão</span><select value={cardFilter} onChange={(event) => { setCardFilter(event.target.value); setPage(1) }}><option value="">Todos</option>{creditCards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label>
              <label><span>Forma</span><select value={paymentMethodFilter} onChange={(event) => { setPaymentMethodFilter(event.target.value); setPage(1) }}><option value="">Todas</option>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>Ordenar</span><select value={sortFilter} onChange={(event) => { setSortFilter(event.target.value); setPage(1) }}><option value="DATE_DESC">Mais recentes</option><option value="DATE_ASC">Mais antigas</option><option value="DUE_DATE_ASC">Vencimento</option><option value="AMOUNT_DESC">Maior valor</option><option value="AMOUNT_ASC">Menor valor</option><option value="DESCRIPTION_ASC">Descrição</option></select></label>
            </div>

            <div className="search-filter">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
                placeholder="Buscar descrição, categoria ou observação"
                aria-label="Buscar movimentação"
              />
              {hasActiveFilters ? <button className="text-button" type="button" onClick={clearFilters}>Limpar filtros</button> : null}
            </div>
          </div>
        </div>

        {isLoading ? <p className="loading-inline">Carregando movimentações...</p> : null}

        {!isLoading && filteredTransactions.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'Nenhuma movimentação encontrada com os filtros atuais.' : 'Nenhuma movimentação encontrada.'}
            description={hasActiveFilters ? 'Ajuste os filtros ou limpe-os para ver outros lançamentos.' : 'Comece registrando uma receita ou despesa.'}
            action={hasActiveFilters ? <button className="secondary-button inline-button" type="button" onClick={clearFilters}>Limpar filtros</button> : <button className="primary-button inline-button" type="button" onClick={() => { setMode('movement'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Adicionar movimentação</button>}
          />
        ) : null}

        {!isLoading && filteredTransactions.length > 0 ? (
          <div className="movement-list">
            {filteredTransactions.map((item) => {
              const statusInfo = getStatusInfo(item)
              const isOpen = item.status === 'PENDING' || item.status === 'OVERDUE'
              const isCardPurchase = Boolean(item.cardPurchaseId || item.paymentMethod === 'CREDIT_CARD')
              const actionIsPending = Boolean(pendingAction)
              const actions = [
                { label: 'Ver detalhes', onSelect: () => openDetails(item), disabled: actionIsPending },
                ...(isCardPurchase ? [{ label: 'Gerenciar no cartão', onSelect: () => navigate('/cartoes'), disabled: actionIsPending }] : item.status !== 'CANCELLED' ? [{ label: item.recurringTransactionId ? 'Editar esta ocorrência' : 'Editar', onSelect: () => openMovementEditor(item), disabled: actionIsPending }] : []),
                ...(isOpen && !isCardPurchase ? [{ label: item.type === 'EXPENSE' ? 'Pagar' : 'Receber', onSelect: () => startPayment(item), disabled: actionIsPending || isSubmitting }] : []),
                ...(!item.creditCardInvoiceId && item.status !== 'CANCELLED' ? [{ label: pendingAction === `cancel:${item.id}` ? 'Cancelando...' : 'Cancelar', onSelect: () => cancel(item), destructive: true, disabled: actionIsPending }] : []),
                ...(item.creditCardInvoiceId ? [{ label: 'Pagamento de fatura: gerencie em Cartões', onSelect: () => navigate('/cartoes'), disabled: actionIsPending }] : [{ label: pendingAction === `delete:${item.id}` ? 'Excluindo...' : item.recurringTransactionId ? 'Excluir esta ocorrência' : 'Excluir', onSelect: () => setDeleteTarget(item), destructive: true, disabled: actionIsPending }]),
              ]
              return (
                <article
                  className="movement-row clickable-row"
                  key={item.id}
                  onClick={() => openDetails(item)}
                >
                  <span className={`movement-symbol ${item.type === 'INCOME' ? 'income' : 'expense'}`}>
                    {item.type === 'INCOME' ? '+' : '−'}
                  </span>

                  <div className="movement-info">
                    <strong>{item.description}</strong>
                    <small>
                      {item.account?.name} · {item.category?.name} · {formatDate(item.date)}
                      {item.dueDate ? ` (Vence: ${formatDate(item.dueDate)})` : ''}
                    </small>
                  </div>

                  <div className="movement-value">
                    <strong className={item.type === 'INCOME' ? 'income-text' : 'expense-text'}>
                      {item.type === 'INCOME' ? '+' : '−'} {formatCurrency(item.amount, user.currency)}
                    </strong>
                    <span className={`status-tag ${statusInfo.className}`}>{statusInfo.label}</span>
                  </div>

                  <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu label={`Ações de ${item.description}`} items={actions} showPrimary={false} />
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
        {!isLoading && pagination.total > pagination.limit ? (
          <nav className="pagination-controls" aria-label="Paginação de movimentações">
            <button className="secondary-button" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button>
            <span>Página {pagination.page} de {Math.ceil(pagination.total / pagination.limit)}</span>
            <button className="secondary-button" type="button" disabled={page >= Math.ceil(pagination.total / pagination.limit)} onClick={() => setPage((current) => current + 1)}>Próxima</button>
          </nav>
        ) : null}
      </section>

      {/* Seção de Transferências */}
      {!isLoading && data.transfers.length > 0 ? (
        <section className="movement-history">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Entre suas contas</p>
              <h2>Transferências</h2>
            </div>
          </div>
          <div className="movement-list">
            {data.transfers.map((item) => (
              <article className="movement-row" key={item.id}>
                <span className="movement-symbol transfer">↔</span>
                <div className="movement-info">
                  <strong>
                    {item.fromAccount.name} → {item.toAccount.name}
                  </strong>
                  <small>
                    {item.description || 'Transferência entre contas'} · {formatDate(item.date)}
                  </small>
                </div>
                <div className="movement-value">
                  <strong>{formatCurrency(item.amount, user.currency)}</strong>
                  {item.isReversed ? <span className="status-tag status-cancelled">Estornada</span> : null}
                </div>
                <div className="row-actions">
                  {!item.isReversed ? (
                    <ActionMenu label="Ações da transferência" showPrimary={false} items={[{ label: 'Ver detalhes', disabled: Boolean(pendingAction), onSelect: () => setTransferDetails(item) }, { label: pendingAction === `reverse:${item.id}` ? 'Estornando...' : 'Estornar', destructive: true, disabled: Boolean(pendingAction), onSelect: () => reverse(item) }]} />
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Excluir movimentação?"
        message={deleteTarget ? `“${deleteTarget.description} - ${formatCurrency(deleteTarget.amount, user.currency)}”. ${deleteTarget.status === 'COMPLETED' ? 'Como ela já possui impacto financeiro, será cancelada e permanecerá no histórico; o saldo será revertido.' : 'Esta ação não poderá ser desfeita.'}` : ''}
        cancelLabel="Cancelar"
        confirmLabel="Excluir"
        destructive
        loading={pendingAction === `delete:${deleteTarget?.id}`}
        loadingLabel="Excluindo..."
        icon="!"
        onCancel={() => { if (!pendingAction) setDeleteTarget(null) }}
        onConfirm={() => { if (deleteTarget) void remove(deleteTarget) }}
      />
    </section>
  )
}
