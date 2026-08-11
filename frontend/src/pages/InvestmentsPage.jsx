import { useEffect, useState } from 'react'
import { investmentService } from '../services/investment.service.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'

export function InvestmentsPage() {
  const { user } = useAuth()
  const [data, setData] = useState({ investments: [], totalInvested: '0', totalCurrent: '0' })
  const [error, setError] = useState('')

  async function load() {
    try { setData(await investmentService.list()); setError('') } catch (requestError) { setError(getApiError(requestError)) }
  }

  useEffect(() => { load() }, [])

  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.target)
    try {
      await investmentService.create({ name: form.get('name'), type: form.get('type'), investedAmount: form.get('investedAmount'), currentAmount: form.get('currentAmount'), applicationDate: form.get('applicationDate'), yieldType: form.get('yieldType') })
      event.target.reset()
      await load()
    } catch (requestError) { setError(getApiError(requestError)) }
  }

  return <section className="page-stack"><div className="page-heading"><p className="eyebrow">Fase 8 · Investimentos</p><h1>Seu patrimônio investido</h1><p>Todos os índices e rentabilidades são informados manualmente.</p></div>{error ? <div className="form-alert">{error}</div> : null}<section className="overview-grid"><article className="overview-card overview-card-primary"><span>Total investido</span><strong>{formatCurrency(data.totalInvested, user.currency)}</strong></article><article className="overview-card"><span>Valor atual</span><strong>{formatCurrency(data.totalCurrent, user.currency)}</strong></article></section><section className="editor-card"><form className="entity-form" onSubmit={save}><label className="form-field"><span>Nome</span><input name="name" required /></label><label className="form-field"><span>Tipo</span><select name="type"><option value="CDB">CDB</option><option value="TESOURO">Tesouro</option><option value="FII">FII</option><option value="ETF">ETF</option><option value="STOCK">Ação</option><option value="CRYPTO">Cripto</option><option value="OTHER">Outro</option></select></label><label className="form-field"><span>Valor investido</span><input name="investedAmount" required inputMode="decimal" /></label><label className="form-field"><span>Valor atual</span><input name="currentAmount" required inputMode="decimal" /></label><label className="form-field"><span>Data de aplicação</span><input name="applicationDate" required type="date" /></label><label className="form-field"><span>Rentabilidade manual</span><select name="yieldType"><option value="CUSTOM">Personalizada</option><option value="CDI_PERCENT">% do CDI</option><option value="SELIC">Selic</option><option value="IPCA">IPCA</option><option value="ANNUAL_RATE">Taxa anual</option></select></label><button className="primary-button">Salvar investimento</button></form></section><div className="movement-list">{data.investments.map((investment) => <article className="movement-row" key={investment.id}><div className="movement-info"><strong>{investment.name}</strong><small>{investment.type} · rentabilidade manual</small></div><div className="movement-value"><strong>{formatCurrency(investment.currentAmount, user.currency)}</strong><small className={Number(investment.profit) >= 0 ? 'income-text' : 'expense-text'}>{investment.profitPercent}%</small></div></article>)}</div></section>
}
