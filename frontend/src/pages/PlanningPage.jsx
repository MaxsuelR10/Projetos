import { useEffect, useState } from 'react'
import { categoryService } from '../services/category.service.js'
import { planningService } from '../services/planning.service.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatCurrency, formatDate, parseCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'
import { CurrencyInput } from '../components/forms/CurrencyInput.jsx'

function GoalProgress({ goal }) {
  const percentage = Number(goal.progress) || 0
  const visualPercentage = Math.min(100, Math.max(0, percentage))
  const remaining = Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount))
  return <article className="goal-card">
    <div className="goal-progress" style={{ '--goal-progress': `${visualPercentage}%` }} aria-label={`Progresso da meta: ${percentage.toFixed(0)}%`}>
      <span>{percentage.toFixed(0)}%</span>
    </div>
    <div className="goal-details">
      <h3>{goal.name}</h3>
      <p>{formatCurrency(goal.currentAmount)} de {formatCurrency(goal.targetAmount)}</p>
      <small>{remaining > 0 ? `Falta: ${formatCurrency(remaining)}` : 'Meta atingida'}</small>
      {goal.deadline ? <small>Prazo: {formatDate(goal.deadline)}</small> : null}
    </div>
  </article>
}

export function PlanningPage() {
  const { user } = useAuth()
  const now = new Date()
  const [month] = useState(now.getMonth() + 1)
  const [year] = useState(now.getFullYear())
  const [categories, setCategories] = useState([])
  const [budgets, setBudgets] = useState([])
  const [goals, setGoals] = useState([])
  const [openForm, setOpenForm] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [goalAmounts, setGoalAmounts] = useState({ targetAmount: '', currentAmount: '' })
  const [error, setError] = useState('')

  async function load() {
    try {
      const [categoryData, budgetData, goalData] = await Promise.all([categoryService.list('active'), planningService.budgets(year, month), planningService.goals()])
      setCategories(categoryData.filter((item) => item.type === 'EXPENSE'))
      setBudgets(budgetData)
      setGoals(goalData)
      setError('')
    } catch (requestError) { setError(getApiError(requestError)) }
  }

  useEffect(() => { load() }, [])

  function closeForm() {
    setOpenForm('')
    setBudgetAmount('')
    setGoalAmounts({ targetAmount: '', currentAmount: '' })
  }

  async function saveBudget(event) {
    event.preventDefault()
    const form = new FormData(event.target)
    try {
      await planningService.saveBudget({ categoryId: form.get('categoryId'), limitAmount: parseCurrency(budgetAmount), year, month })
      event.target.reset()
      closeForm()
      await load()
    } catch (requestError) { setError(getApiError(requestError)) }
  }

  async function saveGoal(event) {
    event.preventDefault()
    const form = new FormData(event.target)
    try {
      await planningService.saveGoal({ name: form.get('name'), targetAmount: parseCurrency(goalAmounts.targetAmount), currentAmount: parseCurrency(goalAmounts.currentAmount) || '0', deadline: form.get('deadline') || null })
      event.target.reset()
      closeForm()
      await load()
    } catch (requestError) { setError(getApiError(requestError)) }
  }

  return <section className="page-stack planning-page">
    <div className="page-heading"><p className="eyebrow">Fase 7 · Planejamento</p><h1>Orçamentos e metas</h1></div>
    {error ? <div className="form-alert">{error}</div> : null}

    <section className="planning-section">
      <div className="section-heading"><div><p className="eyebrow">Orçamentos</p><h2>Limites mensais</h2></div><button className="primary-button inline-button" type="button" onClick={() => setOpenForm('budget')}>+ Adicionar novo orçamento</button></div>
      {openForm === 'budget' ? <section className="editor-card"><div className="editor-heading"><h3>Novo orçamento</h3><button className="text-button" type="button" onClick={closeForm}>Cancelar</button></div><form className="entity-form" onSubmit={saveBudget}><label className="form-field"><span>Categoria</span><select name="categoryId" required><option value="">Selecione</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="form-field"><span>Limite mensal</span><CurrencyInput name="limitAmount" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} required /></label><button className="primary-button">Salvar orçamento</button></form></section> : null}
      {budgets.length ? <div className="movement-list">{budgets.map((budget) => <article className="movement-row" key={budget.id}><div className="movement-info"><strong>{budget.category.name}</strong><small>{formatCurrency(budget.usedAmount, user.currency)} de {formatCurrency(budget.limitAmount, user.currency)}</small></div><div className="movement-value"><strong>{budget.percent.toFixed(0)}%</strong></div></article>)}</div> : <p className="muted-copy">Nenhum orçamento cadastrado.</p>}
    </section>

    <section className="planning-section">
      <div className="section-heading"><div><p className="eyebrow">Metas</p><h2>Objetivos financeiros</h2></div><button className="primary-button inline-button" type="button" onClick={() => setOpenForm('goal')}>+ Adicionar nova meta</button></div>
      {openForm === 'goal' ? <section className="editor-card"><div className="editor-heading"><h3>Nova meta</h3><button className="text-button" type="button" onClick={closeForm}>Cancelar</button></div><form className="entity-form" onSubmit={saveGoal}><label className="form-field"><span>Nome da meta</span><input name="name" required /></label><label className="form-field"><span>Valor alvo</span><CurrencyInput name="targetAmount" value={goalAmounts.targetAmount} onChange={(event) => setGoalAmounts((current) => ({ ...current, targetAmount: event.target.value }))} required /></label><label className="form-field"><span>Valor atual</span><CurrencyInput name="currentAmount" value={goalAmounts.currentAmount} onChange={(event) => setGoalAmounts((current) => ({ ...current, currentAmount: event.target.value }))} /></label><label className="form-field"><span>Prazo</span><input name="deadline" type="date" /></label><button className="primary-button">Salvar meta</button></form></section> : null}
      {goals.length ? <div className="goal-list">{goals.map((goal) => <GoalProgress key={goal.id} goal={goal} />)}</div> : <p className="muted-copy">Nenhuma meta cadastrada.</p>}
    </section>
  </section>
}
