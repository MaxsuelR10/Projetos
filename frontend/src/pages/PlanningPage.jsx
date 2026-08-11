import { useEffect, useState } from 'react'
import { categoryService } from '../services/category.service.js'
import { planningService } from '../services/planning.service.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'

export function PlanningPage() {
  const { user } = useAuth()
  const now = new Date()
  const [month] = useState(now.getMonth() + 1)
  const [year] = useState(now.getFullYear())
  const [categories, setCategories] = useState([])
  const [budgets, setBudgets] = useState([])
  const [goals, setGoals] = useState([])
  const [error, setError] = useState('')

  async function load() {
    try {
      const [categoryData, budgetData, goalData] = await Promise.all([
        categoryService.list('active'),
        planningService.budgets(year, month),
        planningService.goals(),
      ])
      setCategories(categoryData.filter((item) => item.type === 'EXPENSE'))
      setBudgets(budgetData)
      setGoals(goalData)
      setError('')
    } catch (requestError) { setError(getApiError(requestError)) }
  }

  useEffect(() => { load() }, [])

  async function saveBudget(event) {
    event.preventDefault()
    const form = new FormData(event.target)
    try { await planningService.saveBudget({ categoryId: form.get('categoryId'), limitAmount: form.get('limitAmount'), year, month }); event.target.reset(); await load() } catch (requestError) { setError(getApiError(requestError)) }
  }
  async function saveGoal(event) {
    event.preventDefault()
    const form = new FormData(event.target)
    try { await planningService.saveGoal({ name: form.get('name'), targetAmount: form.get('targetAmount'), currentAmount: form.get('currentAmount') || '0', deadline: form.get('deadline') || null }); event.target.reset(); await load() } catch (requestError) { setError(getApiError(requestError)) }
  }

  return <section className="page-stack"><div className="page-heading"><p className="eyebrow">Fase 7 · Planejamento</p><h1>Orçamentos e metas</h1></div>{error ? <div className="form-alert">{error}</div> : null}<section className="editor-card"><form className="entity-form" onSubmit={saveBudget}><label className="form-field"><span>Categoria</span><select name="categoryId" required><option value="">Selecione</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="form-field"><span>Limite mensal</span><input name="limitAmount" required inputMode="decimal" placeholder="0.00" /></label><button className="primary-button">Salvar orçamento</button></form></section><div className="movement-list">{budgets.map((budget) => <article className="movement-row" key={budget.id}><div className="movement-info"><strong>{budget.category.name}</strong><small>{formatCurrency(budget.usedAmount, user.currency)} de {formatCurrency(budget.limitAmount, user.currency)}</small></div><div className="movement-value"><strong>{budget.percent.toFixed(0)}%</strong></div></article>)}</div><section className="editor-card"><form className="entity-form" onSubmit={saveGoal}><label className="form-field"><span>Meta</span><input name="name" required /></label><label className="form-field"><span>Valor alvo</span><input name="targetAmount" required inputMode="decimal" /></label><label className="form-field"><span>Valor atual</span><input name="currentAmount" inputMode="decimal" /></label><label className="form-field"><span>Prazo</span><input name="deadline" type="date" /></label><button className="primary-button">Salvar meta</button></form></section><div className="movement-list">{goals.map((goal) => <article className="movement-row" key={goal.id}><div className="movement-info"><strong>{goal.name}</strong><small>{formatCurrency(goal.currentAmount, user.currency)} de {formatCurrency(goal.targetAmount, user.currency)}</small></div><div className="movement-value"><strong>{goal.progress.toFixed(0)}%</strong></div></article>)}</div></section>
}
