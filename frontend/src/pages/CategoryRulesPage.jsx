import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { accountService } from '../services/account.service.js'
import { categoryRuleService } from '../services/category-rule.service.js'
import { categoryService } from '../services/category.service.js'
import { useToast } from '../hooks/useToast.js'
import { getApiError } from '../utils/get-api-error.js'

const emptyForm = {
  pattern: '',
  matchType: 'CONTAINS',
  type: 'EXPENSE',
  categoryId: '',
  accountId: '',
  priority: 0,
}

export function CategoryRulesPage() {
  const toast = useToast()
  const [rules, setRules] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [status, setStatus] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function load(nextStatus = status) {
    setIsLoading(true)
    setError('')
    try {
      const [loadedRules, loadedAccounts, loadedCategories] = await Promise.all([
        categoryRuleService.list(nextStatus),
        accountService.list('all'),
        categoryService.list('all'),
      ])
      setRules(loadedRules)
      setAccounts(loadedAccounts)
      setCategories(loadedCategories)
    } catch (requestError) {
      setError(getApiError(requestError, 'Não foi possível carregar as regras.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load(status)
    // The status change is the only trigger; load is intentionally kept local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const availableCategories = useMemo(
    () => categories.filter((category) => category.isActive && category.type === form.type),
    [categories, form.type],
  )

  function changeType(type) {
    const firstCategory = categories.find((category) => category.isActive && category.type === type)
    setForm((current) => ({ ...current, type, categoryId: firstCategory?.id || '' }))
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingId('')
  }

  function edit(rule) {
    setEditingId(rule.id)
    setForm({
      pattern: rule.pattern,
      matchType: rule.matchType,
      type: rule.type,
      categoryId: rule.categoryId,
      accountId: rule.accountId || '',
      priority: rule.priority,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.categoryId) {
      setError('Selecione a categoria que será aplicada pela regra.')
      return
    }
    setIsSaving(true)
    setError('')
    const payload = {
      ...form,
      pattern: form.pattern.trim(),
      accountId: form.accountId || null,
      priority: Number(form.priority),
    }
    try {
      if (editingId) {
        await categoryRuleService.update(editingId, payload)
        toast.success('Regra atualizada.')
      } else {
        await categoryRuleService.create(payload)
        toast.success('Regra criada.')
      }
      resetForm()
      await load(status)
    } catch (requestError) {
      const message = getApiError(requestError, 'Não foi possível salvar a regra.')
      setError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  async function toggle(rule) {
    try {
      await categoryRuleService.update(rule.id, { isActive: !rule.isActive })
      toast.success(rule.isActive ? 'Regra pausada.' : 'Regra ativada.')
      await load(status)
    } catch (requestError) {
      toast.error(getApiError(requestError))
    }
  }

  async function remove(rule) {
    if (!window.confirm(`Excluir a regra “${rule.pattern}”? Esta ação não altera lançamentos já importados.`)) return
    try {
      await categoryRuleService.remove(rule.id)
      toast.success('Regra excluída.')
      if (editingId === rule.id) resetForm()
      await load(status)
    } catch (requestError) {
      toast.error(getApiError(requestError))
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading with-action">
        <div>
          <p className="eyebrow">Automação sob seu controle</p>
          <h1>Regras de categorização</h1>
          <p>Ensine o sistema a reconhecer descrições futuras. As regras só afetam novas prévias de importação.</p>
        </div>
        <Link className="secondary-button inline-button" to="/importar">Importar extrato</Link>
      </section>

      {error ? <p className="form-alert" role="alert">{error}</p> : null}

      <section className="editor-card rule-editor">
        <div>
          <p className="eyebrow">{editingId ? 'Editar regra' : 'Nova regra'}</p>
          <h2>{editingId ? 'Ajuste como a regra funciona' : 'Crie uma regra manual'}</h2>
          <p>Exata compara a descrição inteira. “Contém” funciona melhor para nomes recorrentes, como Uber ou Netflix.</p>
        </div>
        <form className="entity-form rule-form" onSubmit={submit}>
          <label className="form-field rule-pattern-field">
            <span>Texto a reconhecer</span>
            <input value={form.pattern} minLength="2" maxLength="180" required placeholder="Ex.: uber" onChange={(event) => setForm((current) => ({ ...current, pattern: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Comparação</span>
            <select value={form.matchType} onChange={(event) => setForm((current) => ({ ...current, matchType: event.target.value }))}>
              <option value="CONTAINS">Contém o texto</option>
              <option value="EXACT">Descrição exata</option>
            </select>
          </label>
          <label className="form-field">
            <span>Tipo</span>
            <select value={form.type} onChange={(event) => changeType(event.target.value)}>
              <option value="EXPENSE">Despesa</option>
              <option value="INCOME">Receita</option>
            </select>
          </label>
          <label className="form-field">
            <span>Categoria aplicada</span>
            <select value={form.categoryId} required onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}>
              <option value="">Selecione</option>
              {availableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Onde vale</span>
            <select value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}>
              <option value="">Todas as contas</option>
              {accounts.filter((account) => account.isActive).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Prioridade</span>
            <input type="number" min="-100" max="100" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} />
          </label>
          <div className="form-actions">
            {editingId ? <button className="secondary-button" type="button" onClick={resetForm}>Cancelar</button> : null}
            <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar regra'}</button>
          </div>
        </form>
      </section>

      <section className="rules-section">
        <div className="section-heading">
          <div><p className="eyebrow">Regras cadastradas</p><h2>Reconhecimentos automáticos</h2></div>
          <div className="segmented-control" aria-label="Filtrar regras">
            {[['all', 'Todas'], ['active', 'Ativas'], ['inactive', 'Pausadas']].map(([value, label]) => (
              <button key={value} className={status === value ? 'active' : ''} type="button" onClick={() => setStatus(value)}>{label}</button>
            ))}
          </div>
        </div>

        {isLoading ? <p className="loading-inline">Carregando regras...</p> : null}
        {!isLoading && !rules.length ? <div className="empty-state"><h3>Nenhuma regra neste filtro</h3><p>Você pode criar uma acima ou ensinar durante a conferência de um CSV.</p></div> : null}
        <div className="rule-list">
          {rules.map((rule) => (
            <article className={`rule-card ${!rule.isActive ? 'is-inactive' : ''}`} key={rule.id}>
              <div className="rule-card-main">
                <div className="rule-card-title">
                  <strong>{rule.matchType === 'EXACT' ? 'Igual a' : 'Contém'} “{rule.pattern}”</strong>
                  <span className={`status-pill ${rule.isActive ? 'is-active' : ''}`}>{rule.isActive ? 'Ativa' : 'Pausada'}</span>
                </div>
                <p>{rule.type === 'EXPENSE' ? 'Despesa' : 'Receita'} → <strong>{rule.category.name}</strong></p>
                <small>{rule.account ? `Somente ${rule.account.name}` : 'Todas as contas'} · Prioridade {rule.priority} · {rule.source === 'IMPORT' ? 'Criada na importação' : 'Criada manualmente'}</small>
                {rule.conflict ? <p className="rule-warning">Conflito: outra regra equivalente aponta para uma categoria diferente.</p> : null}
                {rule.invalidReason ? <p className="rule-warning">{rule.invalidReason}</p> : null}
              </div>
              <div className="rule-actions">
                <button className="ghost-button" type="button" onClick={() => edit(rule)}>Editar</button>
                <button className="secondary-button" type="button" onClick={() => toggle(rule)}>{rule.isActive ? 'Pausar' : 'Ativar'}</button>
                <button className="danger-button" type="button" onClick={() => remove(rule)}>Excluir</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
