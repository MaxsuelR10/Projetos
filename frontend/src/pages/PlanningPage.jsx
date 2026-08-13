import { useCallback, useEffect, useState } from 'react'
import { categoryService } from '../services/category.service.js'
import { planningService } from '../services/planning.service.js'
import { useAuth } from '../hooks/useAuth.js'
import { CurrencyInput } from '../components/forms/CurrencyInput.jsx'
import { formatCurrency, parseCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'

const blankBudget = { categoryId: '', limitAmount: '' }

export function PlanningPage() {
  const { user } = useAuth()
  const now = new Date()
  const [month] = useState(now.getMonth() + 1)
  const [year] = useState(now.getFullYear())
  const [categories, setCategories] = useState([])
  const [budgets, setBudgets] = useState([])
  const [budgetForm, setBudgetForm] = useState(blankBudget)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const load = useCallback(async () => {
    try {
      const [categoryData, budgetData] = await Promise.all([categoryService.list('active'), planningService.budgets(year, month)])
      setCategories(categoryData.filter((item) => item.type === 'EXPENSE')); setBudgets(budgetData); setError('')
    } catch (requestError) { setError(getApiError(requestError)) }
  }, [month, year])
  useEffect(() => { Promise.resolve().then(load) }, [load])
  function changeBudget(event) { setBudgetForm((current) => ({ ...current, [event.target.name]: event.target.value })) }
  function clearBudgetFields() { setBudgetForm(blankBudget) }
  function editBudget(budget) { setBudgetForm({ categoryId: budget.categoryId, limitAmount: formatCurrency(budget.limitAmount, user.currency) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  async function saveBudget(event) {
    event.preventDefault(); setSubmitting(true); setError('')
    try { await planningService.saveBudget({ categoryId: budgetForm.categoryId, limitAmount: parseCurrency(budgetForm.limitAmount), year, month }); clearBudgetFields(); await load() } catch (requestError) { setError(getApiError(requestError)) } finally { setSubmitting(false) }
  }
  return <section className="page-stack">
    <div className="page-heading"><p className="eyebrow">Planejamento</p><h1>Orçamentos</h1><p>Defina limites mensais por categoria. As metas de patrimônio agora ficam dentro de cada investimento.</p></div>
    {error ? <div className="form-alert">{error}</div> : null}
    <section className="editor-card"><div className="editor-heading"><div><p className="eyebrow">Orçamento mensal</p><h2>Definir limite por categoria</h2></div></div><form className="entity-form" onSubmit={saveBudget}>
      <label className="form-field"><span>Categoria</span><select name="categoryId" value={budgetForm.categoryId} onChange={changeBudget} required><option value="">Selecione</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="form-field"><span>Limite mensal</span><CurrencyInput name="limitAmount" value={budgetForm.limitAmount} onChange={changeBudget} required /></label>
      <div className="form-actions"><button className="primary-button" disabled={submitting}>Salvar orçamento</button><button className="secondary-button" type="button" onClick={clearBudgetFields}>Limpar campos</button></div>
    </form></section>
    <div className="movement-list">{budgets.map((budget) => <article className="movement-row" key={budget.id}><div className="movement-info"><strong>{budget.category.name}</strong><small>{formatCurrency(budget.usedAmount, user.currency)} de {formatCurrency(budget.limitAmount, user.currency)}</small></div><div className="movement-value"><strong>{budget.percent.toFixed(0)}%</strong></div><div className="row-actions"><button type="button" onClick={() => editBudget(budget)}>Editar</button></div></article>)}{!budgets.length ? <p className="muted-copy">Nenhum orçamento definido para este mês.</p> : null}</div>
  </section>
}
