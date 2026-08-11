import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { accountService } from '../services/account.service.js'
import { categoryService } from '../services/category.service.js'
import { transactionService } from '../services/transaction.service.js'
import { transferService } from '../services/transfer.service.js'
import { formatCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'

const today = new Date().toISOString().slice(0, 10)
const initialMovement = { type: 'EXPENSE', accountId: '', categoryId: '', subcategoryId: '', description: '', amount: '', date: today, dueDate: '', status: 'COMPLETED', paymentMethod: 'PIX', notes: '' }
const initialTransfer = { fromAccountId: '', toAccountId: '', amount: '', date: today, description: '' }
const paymentMethods = [['PIX', 'PIX'], ['CREDIT_CARD', 'Cartão de crédito'], ['DEBIT_CARD', 'Cartão de débito'], ['BOLETO', 'Boleto'], ['CASH', 'Dinheiro'], ['BANK_TRANSFER', 'Transferência bancária'], ['AUTOMATIC_DEBIT', 'Débito automático'], ['OTHER', 'Outro']]

function formatDate(value) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value)) }
function statusLabel(status) { return ({ PENDING: 'Pendente', COMPLETED: 'Concluído', OVERDUE: 'Em atraso', CANCELLED: 'Cancelado' })[status] || status }

export function TransactionsPage() {
  const { user } = useAuth()
  const [mode, setMode] = useState('movement')
  const [movement, setMovement] = useState(initialMovement)
  const [transfer, setTransfer] = useState(initialTransfer)
  const [data, setData] = useState({ accounts: [], categories: [], transactions: [], transfers: [] })
  const [filter, setFilter] = useState('ALL')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [accounts, categories, transactionResult, transfers] = await Promise.all([
        accountService.list('active'), categoryService.list('active'), transactionService.list({ limit: 50 }), transferService.list(),
      ])
      setData({ accounts, categories, transactions: transactionResult.transactions, transfers })
      setError('')
    } catch (requestError) { setError(getApiError(requestError)) } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const usableCategories = useMemo(() => data.categories.filter((category) => category.type === movement.type), [data.categories, movement.type])
  const selectedCategory = usableCategories.find((category) => category.id === movement.categoryId)
  const filteredTransactions = data.transactions.filter((item) => filter === 'ALL' || item.type === filter)

  function changeMovement(event) {
    const { name, value } = event.target
    setMovement((current) => ({ ...current, [name]: value, ...(name === 'type' ? { categoryId: '', subcategoryId: '' } : {}), ...(name === 'categoryId' ? { subcategoryId: '' } : {}) }))
  }
  function changeTransfer(event) { setTransfer((current) => ({ ...current, [event.target.name]: event.target.value })) }

  async function submitMovement(event) {
    event.preventDefault(); setIsSubmitting(true); setError('')
    try {
      await transactionService.create({ ...movement, subcategoryId: movement.subcategoryId || null, dueDate: movement.dueDate || null, paymentMethod: movement.paymentMethod || null, notes: movement.notes || null })
      setMovement((current) => ({ ...initialMovement, type: current.type, accountId: current.accountId, date: today }))
      await load()
    } catch (requestError) { setError(getApiError(requestError)) } finally { setIsSubmitting(false) }
  }
  async function submitTransfer(event) {
    event.preventDefault(); setIsSubmitting(true); setError('')
    try {
      await transferService.create({ ...transfer, description: transfer.description || null, idempotencyKey: crypto.randomUUID() })
      setTransfer((current) => ({ ...initialTransfer, fromAccountId: current.fromAccountId, date: today }))
      await load()
    } catch (requestError) { setError(getApiError(requestError)) } finally { setIsSubmitting(false) }
  }
  async function complete(item) { try { await transactionService.update(item.id, { status: 'COMPLETED' }); await load() } catch (requestError) { setError(getApiError(requestError)) } }
  async function cancel(item) { if (!window.confirm(`Cancelar o lançamento "${item.description}"?`)) return; try { await transactionService.remove(item.id); await load() } catch (requestError) { setError(getApiError(requestError)) } }
  async function reverse(item) { if (!window.confirm(`Estornar a transferência de ${formatCurrency(item.amount, user.currency)}?`)) return; try { await transferService.reverse(item.id); await load() } catch (requestError) { setError(getApiError(requestError)) } }

  return <section className="page-stack">
    <div className="page-heading"><p className="eyebrow">Fase 3 · Movimentações</p><h1>Registre seu dinheiro</h1><p>Receitas, despesas e transferências atualizam os saldos das suas contas com segurança.</p></div>
    {error ? <div className="form-alert" role="alert">{error}</div> : null}
    <div className="segmented-control transaction-mode" aria-label="Tipo de lançamento"><button type="button" className={mode === 'movement' ? 'is-selected' : ''} onClick={() => setMode('movement')}>Receita ou despesa</button><button type="button" className={mode === 'transfer' ? 'is-selected' : ''} onClick={() => setMode('transfer')}>Transferir entre contas</button></div>
    {mode === 'movement' ? <section className="editor-card"><form className="entity-form" onSubmit={submitMovement}>
      <div className="segmented-control compact-segmented"><button type="button" className={`income ${movement.type === 'INCOME' ? 'is-selected' : ''}`} onClick={() => setMovement((current) => ({ ...current, type: 'INCOME', categoryId: '', subcategoryId: '' }))}>Receita</button><button type="button" className={`expense ${movement.type === 'EXPENSE' ? 'is-selected' : ''}`} onClick={() => setMovement((current) => ({ ...current, type: 'EXPENSE', categoryId: '', subcategoryId: '' }))}>Despesa</button></div>
      <label className="form-field"><span>Descrição</span><input name="description" value={movement.description} onChange={changeMovement} required minLength="2" maxLength="180" placeholder={movement.type === 'INCOME' ? 'Ex.: Salário' : 'Ex.: Mercado'} /></label>
      <label className="form-field"><span>Valor</span><input name="amount" value={movement.amount} onChange={changeMovement} inputMode="decimal" pattern="\d+(\.\d{1,4})?" required placeholder="0.00" /></label>
      <label className="form-field"><span>Conta</span><select name="accountId" value={movement.accountId} onChange={changeMovement} required><option value="">Selecione</option>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label className="form-field"><span>Categoria</span><select name="categoryId" value={movement.categoryId} onChange={changeMovement} required><option value="">Selecione</option>{usableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      {selectedCategory?.subcategories?.length ? <label className="form-field"><span>Subcategoria</span><select name="subcategoryId" value={movement.subcategoryId} onChange={changeMovement}><option value="">Sem subcategoria</option>{selectedCategory.subcategories.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <div />}
      <label className="form-field"><span>Data</span><input name="date" value={movement.date} onChange={changeMovement} type="date" required /></label>
      <label className="form-field"><span>Vencimento (opcional)</span><input name="dueDate" value={movement.dueDate} onChange={changeMovement} type="date" /></label>
      <label className="form-field"><span>Situação</span><select name="status" value={movement.status} onChange={changeMovement}><option value="COMPLETED">Concluído — atualiza saldo</option><option value="PENDING">Pendente — não atualiza saldo</option><option value="OVERDUE">Em atraso — não atualiza saldo</option></select></label>
      <label className="form-field"><span>Forma de pagamento</span><select name="paymentMethod" value={movement.paymentMethod} onChange={changeMovement}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="form-field form-field-wide"><span>Observações</span><input name="notes" value={movement.notes} onChange={changeMovement} maxLength="5000" placeholder="Opcional" /></label>
      <button className="primary-button" type="submit" disabled={isSubmitting || !data.accounts.length}>{isSubmitting ? 'Salvando...' : 'Salvar lançamento'}</button>
    </form></section> : <section className="editor-card"><form className="entity-form" onSubmit={submitTransfer}>
      <label className="form-field"><span>Conta de origem</span><select name="fromAccountId" value={transfer.fromAccountId} onChange={changeTransfer} required><option value="">Selecione</option>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({formatCurrency(account.currentBalance, user.currency)})</option>)}</select></label>
      <label className="form-field"><span>Conta de destino</span><select name="toAccountId" value={transfer.toAccountId} onChange={changeTransfer} required><option value="">Selecione</option>{data.accounts.filter((account) => account.id !== transfer.fromAccountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label className="form-field"><span>Valor</span><input name="amount" value={transfer.amount} onChange={changeTransfer} inputMode="decimal" pattern="\d+(\.\d{1,4})?" required placeholder="0.00" /></label>
      <label className="form-field"><span>Data</span><input name="date" value={transfer.date} onChange={changeTransfer} type="date" required /></label>
      <label className="form-field form-field-wide"><span>Descrição</span><input name="description" value={transfer.description} onChange={changeTransfer} maxLength="180" placeholder="Opcional" /></label>
      <button className="primary-button" type="submit" disabled={isSubmitting || data.accounts.length < 2}>{isSubmitting ? 'Transferindo...' : 'Confirmar transferência'}</button>
    </form></section>}
    <section className="movement-history"><div className="section-heading"><div><p className="eyebrow">Histórico</p><h2>Últimas movimentações</h2></div><div className="history-filter"><button type="button" className={filter === 'ALL' ? 'is-selected' : ''} onClick={() => setFilter('ALL')}>Todas</button><button type="button" className={filter === 'INCOME' ? 'is-selected income' : ''} onClick={() => setFilter('INCOME')}>Receitas</button><button type="button" className={filter === 'EXPENSE' ? 'is-selected expense' : ''} onClick={() => setFilter('EXPENSE')}>Despesas</button></div></div>
      {isLoading ? <p className="loading-inline">Carregando movimentações...</p> : null}
      {!isLoading && filteredTransactions.length === 0 ? <EmptyState title="Nenhum lançamento ainda" description="Registre uma receita ou despesa para começar seu histórico." /> : null}
      {!isLoading && filteredTransactions.length > 0 ? <div className="movement-list">{filteredTransactions.map((item) => <article className="movement-row" key={item.id}><span className={`movement-symbol ${item.type === 'INCOME' ? 'income' : 'expense'}`}>{item.type === 'INCOME' ? '+' : '−'}</span><div className="movement-info"><strong>{item.description}</strong><small>{item.account.name} · {item.category.name} · {formatDate(item.date)}</small></div><div className="movement-value"><strong className={item.type === 'INCOME' ? 'income-text' : 'expense-text'}>{item.type === 'INCOME' ? '+' : '−'} {formatCurrency(item.amount, user.currency)}</strong><span className={`status-tag status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></div><div className="row-actions">{item.status !== 'COMPLETED' && item.status !== 'CANCELLED' ? <button type="button" onClick={() => complete(item)}>Concluir</button> : null}{item.status !== 'CANCELLED' ? <button className="danger-action" type="button" onClick={() => cancel(item)}>Cancelar</button> : null}</div></article>)}</div> : null}
    </section>
    {!isLoading && data.transfers.length > 0 ? <section className="movement-history"><div className="section-heading"><div><p className="eyebrow">Entre suas contas</p><h2>Transferências</h2></div></div><div className="movement-list">{data.transfers.map((item) => <article className="movement-row" key={item.id}><span className="movement-symbol transfer">↔</span><div className="movement-info"><strong>{item.fromAccount.name} → {item.toAccount.name}</strong><small>{item.description || 'Transferência entre contas'} · {formatDate(item.date)}</small></div><div className="movement-value"><strong>{formatCurrency(item.amount, user.currency)}</strong>{item.isReversed ? <span className="status-tag">Estornada</span> : null}</div><div className="row-actions">{!item.isReversed ? <button className="danger-action" type="button" onClick={() => reverse(item)}>Estornar</button> : null}</div></article>)}</div></section> : null}
  </section>
}
