import { useCallback, useEffect, useState } from 'react'
import { investmentService } from '../services/investment.service.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatCurrency, parseCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'
import { CurrencyInput } from '../components/forms/CurrencyInput.jsx'
import { FormDrawer } from '../components/feedback/FormDrawer.jsx'
import { useToast } from '../hooks/useToast.js'

export function InvestmentsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState({ investments: [], totalInvested: '0', totalCurrent: '0' })
  const [amounts, setAmounts] = useState({ investedAmount: '', currentAmount: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => { try { setData(await investmentService.list()); setError('') } catch (requestError) { setError(getApiError(requestError)) } }, [])
  useEffect(() => { const timerId = window.setTimeout(() => { void load() }, 0); return () => window.clearTimeout(timerId) }, [load])
  function closeForm() { if (isSubmitting) return; setFormOpen(false); setAmounts({ investedAmount: '', currentAmount: '' }) }
  async function save(event) {
    event.preventDefault(); setIsSubmitting(true)
    const form = new FormData(event.target)
    try {
      await investmentService.create({ name: form.get('name'), type: form.get('type'), investedAmount: parseCurrency(amounts.investedAmount), currentAmount: parseCurrency(amounts.currentAmount), applicationDate: form.get('applicationDate'), yieldType: form.get('yieldType') })
      setFormOpen(false); setAmounts({ investedAmount: '', currentAmount: '' }); toast.success('Investimento adicionado com sucesso.'); await load()
    } catch (requestError) { setError(getApiError(requestError)) } finally { setIsSubmitting(false) }
  }
  return <section className="page-stack">
    <div className="page-heading with-action"><div><p className="eyebrow">Fase 8 · Investimentos</p><h1>Seu patrimônio investido</h1><p>Todos os índices e rentabilidades são informados manualmente.</p></div><button className="primary-button inline-button" type="button" onClick={() => setFormOpen(true)}>+ Adicionar investimento</button></div>
    {error ? <div className="form-alert">{error}</div> : null}
    <section className="overview-grid"><article className="overview-card overview-card-primary"><span>Total investido</span><strong>{formatCurrency(data.totalInvested, user.currency)}</strong></article><article className="overview-card"><span>Valor atual</span><strong>{formatCurrency(data.totalCurrent, user.currency)}</strong></article></section>
    <div className="movement-list">{data.investments.map((investment) => <article className="movement-row" key={investment.id}><div className="movement-info"><strong>{investment.name}</strong><small>{investment.type} · rentabilidade manual</small></div><div className="movement-value"><strong>{formatCurrency(investment.currentAmount, user.currency)}</strong><small className={Number(investment.profit) >= 0 ? 'income-text' : 'expense-text'}>{investment.profitPercent}%</small></div></article>)}</div>
    <FormDrawer open={formOpen} eyebrow="Novo investimento" title="Adicionar investimento" onClose={closeForm}><form className="entity-form" onSubmit={save}><label className="form-field"><span>Nome</span><input name="name" required /></label><label className="form-field"><span>Tipo</span><select name="type"><option value="CDB">CDB</option><option value="TESOURO">Tesouro</option><option value="FII">FII</option><option value="ETF">ETF</option><option value="STOCK">Ação</option><option value="CRYPTO">Cripto</option><option value="OTHER">Outro</option></select></label><label className="form-field"><span>Valor investido</span><CurrencyInput name="investedAmount" value={amounts.investedAmount} onChange={(event) => setAmounts((current) => ({ ...current, investedAmount: event.target.value }))} required /></label><label className="form-field"><span>Valor atual</span><CurrencyInput name="currentAmount" value={amounts.currentAmount} onChange={(event) => setAmounts((current) => ({ ...current, currentAmount: event.target.value }))} required /></label><label className="form-field"><span>Data de aplicação</span><input name="applicationDate" required type="date" /></label><label className="form-field"><span>Rentabilidade manual</span><select name="yieldType"><option value="CUSTOM">Personalizada</option><option value="CDI_PERCENT">% do CDI</option><option value="SELIC">Selic</option><option value="IPCA">IPCA</option><option value="ANNUAL_RATE">Taxa anual</option></select></label><button className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar investimento'}</button></form></FormDrawer>
  </section>
}
