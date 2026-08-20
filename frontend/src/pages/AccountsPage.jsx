import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { accountService } from '../services/account.service.js'
import { formatAccountType, formatCurrency, parseCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'
import { CurrencyInput } from '../components/forms/CurrencyInput.jsx'

const accountTypes = [
  ['CHECKING', 'Conta corrente'],
  ['DIGITAL', 'Conta digital'],
  ['SAVINGS', 'Poupança'],
  ['CASH', 'Dinheiro'],
  ['WALLET', 'Carteira'],
  ['INVESTMENT', 'Conta de investimento'],
  ['OTHER', 'Outros'],
]

const emptyForm = {
  name: '',
  institution: '',
  type: 'DIGITAL',
  initialBalance: '0',
  color: '#1D6B4F',
  icon: '',
}

export function AccountsPage() {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [balanceAccount, setBalanceAccount] = useState(null)
  const [balance, setBalance] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadAccounts = useCallback(async () => {
    setIsLoading(true)
    try {
      setAccounts(await accountService.list('all'))
      setError('')
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    accountService.list('all')
      .then((loadedAccounts) => {
        if (active) {
          setAccounts(loadedAccounts)
          setError('')
        }
      })
      .catch((requestError) => {
        if (active) setError(getApiError(requestError))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => { active = false }
  }, [])

  function openCreate() {
    setBalanceAccount(null)
    setEditingAccount(null)
    setForm(emptyForm)
    setIsFormOpen(true)
  }

  function openEdit(account) {
    setBalanceAccount(null)
    setEditingAccount(account)
    setForm({
      name: account.name,
      institution: account.institution || '',
      type: account.type,
      initialBalance: account.initialBalance,
      currentBalance: account.currentBalance,
      color: account.color || '#1D6B4F',
      icon: account.icon || '',
    })
    setIsFormOpen(true)
  }

  function updateForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  function closeForm() {
    setIsFormOpen(false)
    setEditingAccount(null)
    setError('')
  }

  function openBalanceEditor(account) {
    setEditingAccount(null)
    setIsFormOpen(false)
    setBalanceAccount(account)
    setBalance(account.currentBalance)
    setError('')
  }

  function closeBalanceEditor() {
    setBalanceAccount(null)
    setBalance('')
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      if (editingAccount) {
        const nextBalance = parseCurrency(form.currentBalance)
        const balanceChanged = Number(nextBalance) !== Number(editingAccount.currentBalance)
        if (balanceChanged && !window.confirm(`Alterar o saldo atual de ${formatCurrency(editingAccount.currentBalance, user.currency)} para ${formatCurrency(nextBalance, user.currency)}?`)) return
        await accountService.update(editingAccount.id, {
          name: form.name,
          institution: form.institution || null,
          type: form.type,
          color: form.color,
          icon: form.icon || null,
        })
        if (balanceChanged) await accountService.adjustBalance(editingAccount.id, nextBalance)
      } else {
        await accountService.create({
          ...form,
          initialBalance: parseCurrency(form.initialBalance),
          institution: form.institution || null,
          icon: form.icon || null,
        })
      }
      closeForm()
      await loadAccounts()
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function toggleStatus(account) {
    try {
      await accountService.update(account.id, { isActive: !account.isActive })
      await loadAccounts()
    } catch (requestError) {
      setError(getApiError(requestError))
    }
  }

  async function submitBalance(event) {
    event.preventDefault()
    const nextBalance = parseCurrency(balance)
    if (!nextBalance) { setError('Informe um saldo vÃ¡lido.'); return }
    if (Number(nextBalance) === Number(balanceAccount.currentBalance)) { closeBalanceEditor(); return }
    if (!window.confirm(`Alterar o saldo atual de ${formatCurrency(balanceAccount.currentBalance, user.currency)} para ${formatCurrency(nextBalance, user.currency)}?`)) return

    setIsSubmitting(true)
    setError('')
    try {
      await accountService.adjustBalance(balanceAccount.id, nextBalance)
      closeBalanceEditor()
      await loadAccounts()
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function remove(account) {
    if (!window.confirm(`Excluir a conta "${account.name}"?`)) return

    try {
      await accountService.remove(account.id)
      await loadAccounts()
    } catch (requestError) {
      setError(getApiError(requestError))
    }
  }

  const activeAccounts = accounts.filter((account) => account.isActive)
  const totalBalance = activeAccounts.reduce((sum, account) => sum + Number(account.projectedBalance ?? account.currentBalance), 0)

  return (
    <section className="page-stack">
      <div className="page-heading with-action">
        <div>
          <p className="eyebrow">Fase 2 · Contas</p>
          <h1>Suas contas</h1>
          <p>Cadastre bancos, carteiras e dinheiro físico para formar seu saldo disponível.</p>
        </div>
        <button className="primary-button inline-button" type="button" onClick={openCreate}>+ Nova conta</button>
      </div>

      <section className="balance-banner">
        <span>Saldo disponível</span>
        <strong>{formatCurrency(totalBalance, user.currency)}</strong>
        <small>Saldo projetado das contas ativas</small>
      </section>

      {error ? <div className="form-alert" role="alert">{error}</div> : null}

      {isFormOpen ? (
        <section className="editor-card" aria-labelledby="account-form-title">
          <div className="editor-heading">
            <div>
              <p className="eyebrow">{editingAccount ? 'Editar conta' : 'Nova conta'}</p>
              <h2 id="account-form-title">{editingAccount ? editingAccount.name : 'Adicionar uma conta'}</h2>
            </div>
            <button className="text-button" type="button" onClick={closeForm}>Cancelar</button>
          </div>
          <form className="entity-form" onSubmit={submit}>
            <label className="form-field"><span>Nome</span><input name="name" value={form.name} onChange={updateForm} required minLength="2" maxLength="100" placeholder="Ex.: Nubank" /></label>
            <label className="form-field"><span>Instituição</span><input name="institution" value={form.institution} onChange={updateForm} maxLength="120" placeholder="Ex.: Nubank" /></label>
            <label className="form-field"><span>Tipo</span><select name="type" value={form.type} onChange={updateForm}>{accountTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {editingAccount ? (
              <label className="form-field"><span>Saldo atual</span><CurrencyInput name="currentBalance" value={form.currentBalance} onChange={updateForm} required /><small>O saldo inicial histórico será preservado. O ajuste fica registrado no histórico da conta.</small></label>
            ) : (
              <label className="form-field"><span>Saldo inicial</span><CurrencyInput name="initialBalance" value={form.initialBalance} onChange={updateForm} required /></label>
            )}
            <label className="form-field color-field"><span>Cor</span><input name="color" value={form.color} onChange={updateForm} type="color" /></label>
            <label className="form-field"><span>Ícone ou apelido visual</span><input name="icon" value={form.icon} onChange={updateForm} maxLength="60" placeholder="Ex.: 💳 ou carteira" /></label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : editingAccount ? 'Salvar alterações' : 'Criar conta'}</button>
          </form>
        </section>
      ) : null}

      {balanceAccount ? (
        <section className="editor-card" aria-labelledby="balance-form-title">
          <div className="editor-heading">
            <div><p className="eyebrow">Ajuste manual</p><h2 id="balance-form-title">Editar saldo de {balanceAccount.name}</h2></div>
            <button className="text-button" type="button" onClick={closeBalanceEditor}>Cancelar</button>
          </div>
          <form className="entity-form" onSubmit={submitBalance}>
            <label className="form-field"><span>Saldo atual registrado</span><input value={formatCurrency(balanceAccount.currentBalance, user.currency)} disabled /></label>
            <label className="form-field"><span>Novo saldo atual</span><CurrencyInput name="currentBalance" value={balance} onChange={(event) => setBalance(event.target.value)} required /></label>
            <p className="form-help form-field-wide">O ajuste Ã© registrado no histÃ³rico da conta e nÃ£o cria uma receita ou despesa.</p>
            <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Confirmar ajuste de saldo'}</button>
          </form>
        </section>
      ) : null}

      {isLoading ? <p className="loading-inline">Carregando contas...</p> : null}
      {!isLoading && accounts.length === 0 ? (
        <EmptyState title="Nenhuma conta cadastrada" description="Adicione sua primeira conta para começar a visualizar seu saldo." action={<button className="primary-button inline-button" type="button" onClick={openCreate}>Cadastrar conta</button>} />
      ) : null}
      {!isLoading && accounts.length > 0 ? (
        <div className="entity-grid">
          {accounts.map((account) => (
            <article className={`account-card ${account.isActive ? '' : 'is-inactive'}`} key={account.id}>
              <div className="account-card-top">
                <span className="color-chip" style={{ backgroundColor: account.color || '#667085' }} aria-hidden="true">{account.icon || account.name.slice(0, 1).toUpperCase()}</span>
                <div><h2>{account.name}</h2><p>{account.institution || formatAccountType(account.type)}</p></div>
                {!account.isActive ? <span className="status-tag">Inativa</span> : null}
              </div>
              <strong>{formatCurrency(account.currentBalance, user.currency)}</strong>
              <small className={Number(account.projectedBalance ?? account.currentBalance) < 0 ? 'expense-text' : ''}>Disponível projetado: {formatCurrency(account.projectedBalance ?? account.currentBalance, user.currency)}</small>
              {Number(account.pendingCommitments) > 0 ? <small>Compromissos pendentes: {formatCurrency(account.pendingCommitments, user.currency)}</small> : <small>Saldo inicial: {formatCurrency(account.initialBalance, user.currency)}</small>}
              <div className="card-actions">
                <button type="button" onClick={() => openEdit(account)}>Editar</button>
                <button type="button" onClick={() => openBalanceEditor(account)}>Editar saldo</button>
                <button type="button" onClick={() => toggleStatus(account)}>{account.isActive ? 'Desativar' : 'Ativar'}</button>
                <button type="button" className="danger-action" onClick={() => remove(account)}>Excluir</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
