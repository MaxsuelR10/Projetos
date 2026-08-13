import { useCallback, useEffect, useMemo, useState } from 'react'
import { investmentService } from '../services/investment.service.js'
import { useAuth } from '../hooks/useAuth.js'
import { CurrencyInput } from '../components/forms/CurrencyInput.jsx'
import { formatCurrency, formatDate, parseCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'

const today = new Date().toISOString().slice(0, 10)
const blankForm = { name: '', institution: '', type: 'CDB', initialAmount: '', targetAmount: '', goalDeadline: '', applicationDate: today, maturityDate: '', yieldType: 'CDI_PERCENT', indexPercentage: '110', cdiCustomPercentage: '', manualRate: '', manualEarnings: '', liquidity: '', notes: '' }
const blankContribution = { amount: '', date: today, notes: '' }
const investmentTypes = [['CDB', 'CDB'], ['TESOURO', 'Tesouro'], ['LCI', 'LCI'], ['LCA', 'LCA'], ['FII', 'FII'], ['ETF', 'ETF'], ['STOCK', 'Ação'], ['FUND', 'Fundo'], ['CRYPTO', 'Cripto'], ['SAVINGS', 'Poupança'], ['FIXED_INCOME', 'Renda fixa'], ['OTHER', 'Outro']]
const yieldTypes = [['CDI_PERCENT', 'Automática — % do CDI'], ['SELIC', 'Automática — Selic'], ['IPCA', 'Automática — IPCA'], ['ANNUAL_RATE', 'Manual — taxa anual'], ['MONTHLY_RATE', 'Manual — taxa mensal'], ['CUSTOM', 'Manual — sem índice']]
function dateInput(value) { return value ? new Date(value).toISOString().slice(0, 10) : '' }
function formatPercent(value) { return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` }

export function InvestmentsPage() {
  const { user } = useAuth()
  const [data, setData] = useState({ investments: [], legacyGoals: [], indices: [], totalInvested: '0', totalEarnings: '0', totalCurrent: '0', indicesStale: false, indicesUnavailable: false })
  const [form, setForm] = useState(blankForm)
  const [editingInvestment, setEditingInvestment] = useState(null)
  const [contributionEditor, setContributionEditor] = useState(null)
  const [contributionForm, setContributionForm] = useState(blankContribution)
  const [legacyTargets, setLegacyTargets] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const load = useCallback(async () => { try { setData(await investmentService.list()); setError('') } catch (requestError) { setError(getApiError(requestError)) } }, [])
  useEffect(() => { Promise.resolve().then(load) }, [load])
  const automaticYield = ['CDI_PERCENT', 'SELIC', 'IPCA'].includes(form.yieldType)
  const selectedIndices = useMemo(() => new Map(data.indices.map((item) => [item.code, item])), [data.indices])

  function change(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value, ...(name === 'yieldType' && value === 'CDI_PERCENT' ? { indexPercentage: current.indexPercentage || '110', referenceIndex: 'CDI' } : {}), ...(name === 'yieldType' && value === 'SELIC' ? { referenceIndex: 'SELIC' } : {}), ...(name === 'yieldType' && value === 'IPCA' ? { referenceIndex: 'IPCA' } : {}) }))
  }
  function clearFields() { setForm({ ...blankForm, applicationDate: today }) }
  function openNewInvestment() { setEditingInvestment(null); clearFields(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function edit(investment) {
    setEditingInvestment(investment)
    const standardCdiPercentage = ['100', '105', '110', '120'].includes(investment.indexPercentage) ? investment.indexPercentage : 'custom'
    setForm({ name: investment.name, institution: investment.institution || '', type: investment.type, initialAmount: '', targetAmount: investment.goal ? formatCurrency(investment.goal.targetAmount, user.currency) : '', goalDeadline: dateInput(investment.goal?.deadline), applicationDate: dateInput(investment.applicationDate), maturityDate: dateInput(investment.maturityDate), yieldType: investment.yieldType, indexPercentage: standardCdiPercentage, cdiCustomPercentage: standardCdiPercentage === 'custom' ? investment.indexPercentage || '' : '', manualRate: investment.manualRate || '', manualEarnings: formatCurrency(investment.manualEarnings || '0', user.currency), liquidity: investment.liquidity || '', notes: investment.notes || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function investmentPayload() {
    const targetAmount = form.targetAmount ? parseCurrency(form.targetAmount) : undefined
    const goalPayload = targetAmount
      ? { targetAmount, goalDeadline: form.goalDeadline || null }
      : editingInvestment?.goal ? { targetAmount: null }
      : {}
    return {
      name: form.name, institution: form.institution || null, type: form.type, applicationDate: form.applicationDate, maturityDate: form.maturityDate || null, liquidity: form.liquidity || null,
      yieldType: form.yieldType, referenceIndex: automaticYield ? (form.yieldType === 'CDI_PERCENT' ? 'CDI' : form.yieldType) : null,
      indexPercentage: form.yieldType === 'CDI_PERCENT' ? (form.indexPercentage === 'custom' ? form.cdiCustomPercentage : form.indexPercentage) : null, manualRate: ['ANNUAL_RATE', 'MONTHLY_RATE', 'CUSTOM'].includes(form.yieldType) && form.manualRate ? form.manualRate : null,
      manualEarnings: parseCurrency(form.manualEarnings) || '0', notes: form.notes || null, ...goalPayload,
    }
  }
  async function save(event) {
    event.preventDefault(); setSubmitting(true); setError('')
    try {
      const payload = investmentPayload()
      if (editingInvestment) await investmentService.update(editingInvestment.id, payload)
      else await investmentService.create({ ...payload, initialAmount: parseCurrency(form.initialAmount), initialContributionNotes: null })
      setEditingInvestment(null); clearFields(); await load()
    } catch (requestError) { setError(getApiError(requestError)) } finally { setSubmitting(false) }
  }
  function openContribution(investment, contribution = null) {
    setContributionEditor({ investment, contribution })
    setContributionForm(contribution ? { amount: formatCurrency(contribution.amount, user.currency), date: contribution.date, notes: contribution.notes || '' } : { ...blankContribution, date: today })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function closeContribution() { setContributionEditor(null); setContributionForm(blankContribution) }
  async function saveContribution(event) {
    event.preventDefault(); if (!contributionEditor) return; setSubmitting(true); setError('')
    try {
      const payload = { amount: parseCurrency(contributionForm.amount), date: contributionForm.date, notes: contributionForm.notes || null }
      if (contributionEditor.contribution) await investmentService.updateContribution(contributionEditor.contribution.id, payload)
      else await investmentService.addContribution(contributionEditor.investment.id, payload)
      closeContribution(); await load()
    } catch (requestError) { setError(getApiError(requestError)) } finally { setSubmitting(false) }
  }
  async function removeContribution(contribution) {
    if (!window.confirm(`Excluir o aporte de ${formatCurrency(contribution.amount, user.currency)}?`)) return
    try { await investmentService.removeContribution(contribution.id); await load() } catch (requestError) { setError(getApiError(requestError)) }
  }
  async function removeInvestment(investment) {
    if (!window.confirm(`Excluir o investimento "${investment.name}" e todo o histórico de aportes?`)) return
    try { await investmentService.remove(investment.id); if (editingInvestment?.id === investment.id) { setEditingInvestment(null); clearFields() }; await load() } catch (requestError) { setError(getApiError(requestError)) }
  }
  async function adoptLegacyGoal(goal) {
    const investmentId = legacyTargets[goal.id]
    if (!investmentId) { setError('Selecione o investimento que receberá esta meta antiga.'); return }
    try { await investmentService.adoptLegacyGoal(investmentId, goal.id); await load() } catch (requestError) { setError(getApiError(requestError)) }
  }
  async function refreshIndices() { setSubmitting(true); try { await investmentService.refreshIndices(); await load() } catch (requestError) { setError(getApiError(requestError)) } finally { setSubmitting(false) } }

  return <section className="page-stack">
    <div className="page-heading with-action"><div><p className="eyebrow">Investimentos</p><h1>Carteira, aportes e metas</h1><p>Controle cada investimento, seus rendimentos e o objetivo que deseja alcançar no mesmo lugar.</p></div><button className="primary-button inline-button" type="button" onClick={openNewInvestment}>+ Novo investimento</button></div>
    {error ? <div className="form-alert" role="alert">{error}</div> : null}
    <section className="overview-grid investment-overview"><article className="overview-card"><span>Total aportado</span><strong>{formatCurrency(data.totalInvested, user.currency)}</strong></article><article className="overview-card"><span>Rendimentos</span><strong className={Number(data.totalEarnings) >= 0 ? 'income-text' : 'expense-text'}>{formatCurrency(data.totalEarnings, user.currency)}</strong></article><article className="overview-card overview-card-primary"><span>Valor atual da carteira</span><strong>{formatCurrency(data.totalCurrent, user.currency)}</strong></article></section>
    <section className="index-status-card"><div><p className="eyebrow">Índices de referência</p><strong>{selectedIndices.size ? [...selectedIndices.values()].map((item) => `${item.code}: ${formatPercent(item.rate)}${item.period === 'DAILY' ? ' ao dia' : ' ao ano'}`).join(' · ') : 'Aguardando a primeira atualização'}</strong><small>{data.indices[0] ? `Última atualização: ${new Date(data.indices[0].fetchedAt).toLocaleString('pt-BR')}` : 'Os valores são consultados pelo backend e armazenados em cache.'}{data.indicesStale ? ' Usando o último dado válido.' : ''}</small></div><button className="secondary-button" type="button" disabled={submitting} onClick={refreshIndices}>Atualizar índices</button></section>
    <section className="editor-card"><div className="editor-heading"><div><p className="eyebrow">{editingInvestment ? 'Editar investimento' : 'Novo investimento'}</p><h2>{editingInvestment ? editingInvestment.name : 'Cadastro com meta integrada'}</h2></div>{editingInvestment ? <button className="text-button" type="button" onClick={() => { setEditingInvestment(null); clearFields() }}>Cancelar edição</button> : null}</div><form className="entity-form" onSubmit={save}>
      <label className="form-field"><span>Nome</span><input name="name" value={form.name} onChange={change} required minLength="2" placeholder="Ex.: CDB Reserva de Emergência" /></label><label className="form-field"><span>Instituição</span><input name="institution" value={form.institution} onChange={change} placeholder="Opcional" /></label><label className="form-field"><span>Tipo</span><select name="type" value={form.type} onChange={change}>{investmentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>Data da aplicação</span><input name="applicationDate" value={form.applicationDate} onChange={change} required type="date" /></label>
      {!editingInvestment ? <label className="form-field"><span>Valor inicial investido</span><CurrencyInput name="initialAmount" value={form.initialAmount} onChange={change} required /></label> : <div className="form-help">O total investido é composto pelo histórico de aportes abaixo.</div>}<label className="form-field"><span>Meta do investimento</span><CurrencyInput name="targetAmount" value={form.targetAmount} onChange={change} /><small>Opcional: o progresso será calculado pelo valor atual.</small></label><label className="form-field"><span>Prazo da meta</span><input name="goalDeadline" value={form.goalDeadline} onChange={change} type="date" /></label><label className="form-field"><span>Vencimento do investimento</span><input name="maturityDate" value={form.maturityDate} onChange={change} type="date" /></label>
      <label className="form-field"><span>Tipo de rentabilidade</span><select name="yieldType" value={form.yieldType} onChange={change}>{yieldTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>{automaticYield ? 'Baseada em índice atualizado pelo sistema.' : 'Definida manualmente por você.'}</small></label>
      {form.yieldType === 'CDI_PERCENT' ? <label className="form-field"><span>Percentual do CDI</span><select name="indexPercentage" value={form.indexPercentage} onChange={change}><option value="100">100% do CDI</option><option value="105">105% do CDI</option><option value="110">110% do CDI</option><option value="120">120% do CDI</option><option value="custom">Personalizado</option></select>{form.indexPercentage === 'custom' ? <input name="cdiCustomPercentage" value={form.cdiCustomPercentage} onChange={change} required inputMode="decimal" placeholder="Ex.: 115" /> : null}</label> : null}
      {['ANNUAL_RATE', 'MONTHLY_RATE', 'CUSTOM'].includes(form.yieldType) ? <label className="form-field"><span>{form.yieldType === 'MONTHLY_RATE' ? 'Taxa mensal (%)' : form.yieldType === 'CUSTOM' ? 'Taxa anual de referência (%)' : 'Taxa anual manual (%)'}</span><input name="manualRate" value={form.manualRate} onChange={change} inputMode="decimal" required={form.yieldType !== 'CUSTOM'} placeholder="Ex.: 12,50" />{form.yieldType === 'CUSTOM' ? <small>Opcional: informe uma taxa ou registre os rendimentos manuais abaixo.</small> : null}</label> : null}
      <label className="form-field"><span>Rendimentos manuais acumulados</span><CurrencyInput name="manualEarnings" value={form.manualEarnings} onChange={change} /><small>Use apenas para ajustes manuais; aportes continuam separados.</small></label><label className="form-field"><span>Liquidez</span><input name="liquidity" value={form.liquidity} onChange={change} placeholder="Ex.: D+0" /></label><label className="form-field form-field-wide"><span>Observações</span><input name="notes" value={form.notes} onChange={change} maxLength="5000" placeholder="Opcional" /></label><div className="form-actions"><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : editingInvestment ? 'Salvar alterações' : 'Criar investimento'}</button><button className="secondary-button" type="button" onClick={clearFields}>Limpar campos</button></div>
    </form></section>
    {contributionEditor ? <section className="editor-card contribution-editor"><div className="editor-heading"><div><p className="eyebrow">{contributionEditor.contribution ? 'Editar aporte' : 'Novo aporte'}</p><h2>{contributionEditor.investment.name}</h2></div><button className="text-button" type="button" onClick={closeContribution}>Cancelar</button></div><form className="entity-form" onSubmit={saveContribution}><label className="form-field"><span>Valor do aporte</span><CurrencyInput name="amount" value={contributionForm.amount} onChange={(event) => setContributionForm((current) => ({ ...current, amount: event.target.value }))} required /></label><label className="form-field"><span>Data</span><input name="date" value={contributionForm.date} onChange={(event) => setContributionForm((current) => ({ ...current, date: event.target.value }))} type="date" required /></label><label className="form-field form-field-wide"><span>Observações</span><input name="notes" value={contributionForm.notes} onChange={(event) => setContributionForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Opcional" /></label><div className="form-actions"><button className="primary-button" type="submit" disabled={submitting}>{contributionEditor.contribution ? 'Salvar aporte' : 'Adicionar aporte'}</button><button className="secondary-button" type="button" onClick={() => setContributionForm({ ...blankContribution, date: today })}>Limpar campos</button></div></form></section> : null}
    {data.legacyGoals.length ? <section className="legacy-goals-card"><div><p className="eyebrow">Metas anteriores</p><h2>Vincule metas que ainda não possuem investimento</h2><p>Esses dados foram preservados durante a migração.</p></div>{data.legacyGoals.map((goal) => <div className="legacy-goal-row" key={goal.id}><span><strong>{goal.name}</strong><small>Meta: {formatCurrency(goal.targetAmount, user.currency)}</small></span><select value={legacyTargets[goal.id] || ''} onChange={(event) => setLegacyTargets((current) => ({ ...current, [goal.id]: event.target.value }))}><option value="">Selecione o investimento</option>{data.investments.filter((investment) => !investment.goal).map((investment) => <option key={investment.id} value={investment.id}>{investment.name}</option>)}</select><button type="button" className="secondary-button" onClick={() => adoptLegacyGoal(goal)}>Vincular</button></div>)}</section> : null}
    <section className="investment-list"><div className="section-heading"><div><p className="eyebrow">Sua carteira</p><h2>Investimentos acompanhados</h2></div></div>{!data.investments.length ? <p className="muted-copy">Nenhum investimento cadastrado. Crie o primeiro acima.</p> : data.investments.map((investment) => <article className="investment-card" key={investment.id}><div className="investment-card-header"><div><span className="status-tag">{investment.type}</span><h2>{investment.name}</h2><p>{investment.institution || 'Instituição não informada'} · {investment.yieldType === 'CDI_PERCENT' ? `${investment.indexPercentage}% do CDI` : investment.yieldType.replaceAll('_', ' ')}</p></div><div className="card-actions"><button type="button" onClick={() => edit(investment)}>Editar</button><button type="button" onClick={() => openContribution(investment)}>+ Aporte</button><button className="danger-action" type="button" onClick={() => removeInvestment(investment)}>Excluir</button></div></div><div className="investment-values"><div><span>Investido</span><strong>{formatCurrency(investment.investedAmount, user.currency)}</strong></div><div><span>Rendimentos</span><strong className={Number(investment.earnings) >= 0 ? 'income-text' : 'expense-text'}>{formatCurrency(investment.earnings, user.currency)}</strong></div><div><span>Valor atual</span><strong>{formatCurrency(investment.currentAmount, user.currency)}</strong></div></div>{investment.goal ? <section className={`goal-progress ${investment.goalAchieved ? 'is-achieved' : ''}`}><div><strong>{formatCurrency(investment.currentAmount, user.currency)} de {formatCurrency(investment.goal.targetAmount, user.currency)}</strong><span>{investment.goalAchieved ? 'Meta alcançada!' : `Faltam ${formatCurrency(investment.goalRemaining, user.currency)}`}</span></div><div className="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(Number(investment.goalProgress), 100)}><span style={{ width: `${Math.min(Number(investment.goalProgress), 100)}%` }} /></div><small>{formatPercent(investment.goalProgress)} da meta alcançada{investment.goal.deadline ? ` · prazo: ${formatDate(investment.goal.deadline)}` : ''}</small></section> : <p className="form-help">Sem meta definida. Edite este investimento para adicionar uma.</p>}<details className="contribution-history"><summary>Histórico de aportes ({investment.contributions.length})</summary>{investment.contributions.map((contribution) => <div className="contribution-row" key={contribution.id}><span>{formatDate(contribution.date)}{contribution.notes ? ` · ${contribution.notes}` : ''}</span><strong>{formatCurrency(contribution.amount, user.currency)}</strong><div className="row-actions"><button type="button" onClick={() => openContribution(investment, contribution)}>Editar</button><button className="danger-action" type="button" onClick={() => removeContribution(contribution)}>Excluir</button></div></div>)}</details></article>)}</section>
  </section>
}
