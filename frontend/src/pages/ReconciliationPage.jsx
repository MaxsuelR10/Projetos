import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { accountService } from '../services/account.service.js'
import { reconciliationService } from '../services/reconciliation.service.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'
import { FINANCIAL_DATA_CHANGED } from '../utils/financial-events.js'
import { useToast } from '../hooks/useToast.js'

const kinds = { INCOME: 'Receita', EXPENSE: 'Despesa', INVOICE: 'Pagamento de fatura', TRANSFER_IN: 'Transferência recebida', TRANSFER_OUT: 'Transferência enviada', ADJUSTMENT: 'Ajuste manual' }
const metrics = [
  ['opening', 'Saldo no início do mês', 'PRIOR'],
  ['income', 'Receitas recebidas', 'INCOME'],
  ['expense', 'Despesas pagas', 'EXPENSE'],
  ['transferIn', 'Transferências recebidas', 'TRANSFER_IN'],
  ['transferOut', 'Transferências enviadas', 'TRANSFER_OUT'],
  ['invoicePayments', 'Faturas pagas', 'INVOICE'],
  ['adjustments', 'Ajustes de saldo', 'ADJUSTMENT'],
  ['closing', 'Saldo final calculado', 'ALL'],
]
function previousMonth() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const [year, month] = today.split('-').map(Number)
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7)
}
function normalizeBalance(value) {
  let text = value.trim().replace(/R\$\s*/g, '').replace(/\s/g, '')
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d{1,15}(?:\.\d{1,4})?$/.test(text)) return undefined
  const [integer, fraction = ''] = text.split('.')
  const digits = integer.replace(/^(-?)0+(?=\d)/, '$1')
  const tail = fraction.replace(/0+$/, '')
  text = digits + (tail ? '.' + tail : '')
  return text === '-0' ? '0' : text
}

export function ReconciliationPage() {
  const toast = useToast()
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [month, setMonth] = useState(previousMonth)
  const [bankInput, setBankInput] = useState('')
  const [justification, setJustification] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const saveRequest = useRef(null)
  const [scope, setScope] = useState('PERIOD')
  const [search, setSearch] = useState('')
  const [duplicatesOnly, setDuplicatesOnly] = useState(false)
  const [detailId, setDetail] = useState(null)
  const bankBalance = normalizeBalance(bankInput)

  useEffect(() => {
    accountService.list('all').then((loaded) => {
      setAccounts(loaded)
      if (loaded.length === 1) setAccountId(loaded[0].id)
    }).catch((requestError) => setError(getApiError(requestError)))
    const update = () => setRefresh((value) => value + 1)
    window.addEventListener('focus', update)
    window.addEventListener(FINANCIAL_DATA_CHANGED, update)
    return () => {
      window.removeEventListener('focus', update)
      window.removeEventListener(FINANCIAL_DATA_CHANGED, update)
    }
  }, [])

  useEffect(() => {
    if (!accountId || !/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) return
    let cancelled = false
    const timer = setTimeout(() => {
      reconciliationService.preview(accountId, month, bankBalance).then((snapshot) => {
        if (cancelled) return
        setData(snapshot)
        setError('')
      }).catch((requestError) => {
        if (!cancelled) { setData(null); setError(getApiError(requestError)) }
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [accountId, month, bankBalance, refresh])

  const current = data?.account.id === accountId && data?.month === month ? data : null
  const comparisonReady = current && bankBalance !== undefined && current.bankBalance === bankBalance
  const latest = current?.reviews[0]
  const detail = current ? [...current.movements, ...current.priorMovements].find((item) => item.id === detailId) : null
  const alreadyReviewed = comparisonReady && latest && !latest.stale && latest.bankBalance === bankBalance && (latest.justification || '') === justification.trim()
  const canSave = comparisonReady && current.canReview && !alreadyReviewed
    && (current.difference === '0' && !current.legacyCount || justification.trim().length >= 5)
  const rows = useMemo(() => {
    if (!current) return []
    const all = scope === 'PRIOR' ? current.priorMovements
      : scope === 'ALL' ? [...current.priorMovements, ...current.movements]
        : scope === 'PERIOD' ? current.movements : current.movements.filter((item) => item.kind === scope)
    return all.filter((item) => (!duplicatesOnly || item.possibleDuplicate)
      && (item.description + ' ' + (item.category || '')).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  }, [current, scope, search, duplicatesOnly])

  function changeContext(field, value) {
    if (field === 'account') setAccountId(value)
    else setMonth(value)
    setData(null)
    setBankInput('')
    setJustification('')
    setDetail(null)
    setScope('PERIOD')
    setSearch('')
    setDuplicatesOnly(false)
  }
  function changeBank(value) {
    setBankInput(value)
  }
  async function save(event) {
    event.preventDefault()
    if (!canSave || isSaving) return
    const payload = { accountId, month, bankBalance, justification: justification.trim(), snapshotHash: current.snapshotHash }
    const key = JSON.stringify(payload)
    if (saveRequest.current?.key !== key) saveRequest.current = { key, requestId: crypto.randomUUID() }
    setIsSaving(true)
    setError('')
    try {
      await reconciliationService.save({ ...payload, requestId: saveRequest.current.requestId })
      toast.success('Revisão do mês registrada.')
      setRefresh((value) => value + 1)
    } catch (requestError) {
      const message = getApiError(requestError)
      setError(message)
      toast.error(message)
      setRefresh((value) => value + 1)
    } finally { setIsSaving(false) }
  }

  return (
    <div className="page-stack reconciliation-page">
      <section className="page-heading with-action">
        <div><p className="eyebrow">Fechamento do mês</p><h1>Conciliação mensal</h1><p>Confira o saldo final do extrato e os movimentos que formam o saldo da conta.</p></div>
        <Link className="secondary-button inline-button" to="/importar">Importar extrato</Link>
      </section>
      {error ? <p className="form-alert" role="alert">{error}</p> : null}
      <section className="editor-card reconciliation-controls">
        <label className="form-field"><span>Conta</span><select value={accountId} onChange={(event) => changeContext('account', event.target.value)}><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.isActive ? '' : ' · Inativa'}</option>)}</select></label>
        <label className="form-field"><span>Mês do extrato</span><input type="month" min="1900-01" max="2099-12" value={month} onChange={(event) => changeContext('month', event.target.value)} /></label>
        <button className="secondary-button" type="button" onClick={() => { setData(null); setRefresh((value) => value + 1) }} disabled={!accountId}>Atualizar conferência</button>
      </section>
      {!accountId ? <section className="empty-state"><p>Escolha uma conta para conferir o mês.</p></section> : !current ? <p className="loading-inline" role="status">{error ? 'Confira o aviso acima.' : 'Calculando o histórico...'}</p> : (
        <>
          <section className="reconciliation-status">
            <p>O saldo considera a data de pagamento ou recebimento, transferências e ajustes registrados. O saldo inicial cadastrado é a base do histórico. Compras no cartão entram apenas no pagamento da fatura.</p>
            {!current.periodEnded ? <p className="form-notice">Este mês ainda não terminou. Você pode conferir os movimentos e registrar a revisão após o fechamento.</p> : null}
            {current.warnings.map((warning) => <p className="import-warning" key={warning}>{warning}</p>)}
            {current.unexplainedBalance !== '0' ? <p>Diferença entre o saldo atual e o histórico registrado: <strong>{formatCurrency(current.unexplainedBalance)}</strong></p> : null}
            {latest ? <p className={latest.stale ? 'import-warning' : 'form-notice'}>{latest.stale ? 'Os movimentos mudaram desde a última revisão. Confira e registre uma nova revisão.' : 'O histórico corresponde à última revisão registrada.'}</p> : null}
          </section>
          <section className="reconciliation-metrics" aria-label="Composição do saldo">
            {metrics.map(([key, label, filter]) => <button type="button" className={scope === filter ? 'is-selected' : ''} key={key} onClick={() => { setScope(filter); setDetail(null); setSearch(''); setDuplicatesOnly(false) }}><span>{label}</span><strong>{formatCurrency(current.totals[key])}</strong><small>Ver composição</small></button>)}
          </section>
          <section className="editor-card reconciliation-comparison">
            <div><p className="eyebrow">Saldo no extrato</p><h2>Compare o fechamento</h2><p>Informe o saldo do último dia deste mês, incluindo centavos e sinal negativo quando houver.</p></div>
            <form onSubmit={save}>
              <label className="form-field"><span>Saldo final informado pelo banco</span><input type="text" inputMode="decimal" value={bankInput} placeholder="Ex.: 1.250,00 ou -50,00" onChange={(event) => changeBank(event.target.value)} /></label>
              {bankInput && bankBalance === undefined ? <p className="form-alert">Informe um saldo válido, com até quatro casas decimais.</p> : null}
              <div className="reconciliation-difference" role="status">
                <span>Diferença: banco − sistema</span>
                <strong>{comparisonReady ? formatCurrency(current.difference) : 'Informe o saldo para comparar'}</strong>
                {comparisonReady && (current.difference.split('.')[1]?.length || 0) > 2 ? <small>Diferença exata: {current.difference.replace('.', ',')}</small> : null}
                {comparisonReady ? <p>{current.difference === '0' ? 'Os saldos conferem.' : 'Os saldos divergem. Revise faltantes, possíveis duplicidades e datas de pagamento.'}</p> : null}
              </div>
              <label className="form-field"><span>Observação / justificativa{comparisonReady && (current.difference !== '0' || current.legacyCount) ? ' · obrigatória' : ''}</span><textarea rows="3" maxLength="2000" value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Explique qualquer diferença que permanecer após a conferência." /></label>
              <p>Registrar a revisão preserva uma cópia da conferência. Não cria ajustes de saldo nem bloqueia alterações nos lançamentos.</p>
              <button className="primary-button" type="submit" disabled={!canSave || isSaving}>{isSaving ? 'Registrando...' : alreadyReviewed ? 'Esta conferência já está registrada' : 'Registrar revisão do mês'}</button>
            </form>
          </section>
          <section className="editor-card reconciliation-movements">
            <div className="section-heading"><div><p className="eyebrow">Composição selecionada</p><h2>{scope === 'PERIOD' ? 'Movimentos do mês' : metrics.find((item) => item[2] === scope)?.[1]}</h2></div><button className="secondary-button" type="button" onClick={() => { setScope('PERIOD'); setSearch(''); setDuplicatesOnly(false) }}>Ver mês completo</button></div>
            {scope === 'PRIOR' || scope === 'ALL' ? <p>Saldo inicial cadastrado: <strong>{formatCurrency(current.account.initialBalance)}</strong>, mais os movimentos anteriores. O saldo inicial é a base; não é um lançamento.</p> : null}
            <div className="reconciliation-search"><label className="form-field"><span>Buscar descrição ou categoria</span><input value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="checkbox-field"><input type="checkbox" checked={duplicatesOnly} onChange={(event) => setDuplicatesOnly(event.target.checked)} />Possíveis duplicidades</label></div>
            <div className="reconciliation-event-list">
              {!rows.length ? <p>Nenhum movimento neste filtro.</p> : rows.map((item) => <button type="button" className="reconciliation-event" key={item.id} onClick={() => setDetail(item.id)}><div><strong>{item.description}</strong><small>{formatDate(item.date)} · {kinds[item.kind]}{item.category ? ' · ' + item.category : ''}</small>{item.possibleDuplicate ? <small className="duplicate-note">Possível duplicidade: confira com o extrato</small> : null}</div><strong className={item.amount.startsWith('-') ? 'expense-text' : 'income-text'}>{formatCurrency(item.amount)}</strong></button>)}
            </div>
            {detail ? <section className="reconciliation-detail"><div className="section-heading"><h3>{detail.description}</h3><button className="text-button" type="button" onClick={() => setDetail(null)}>Fechar detalhe</button></div><p>{kinds[detail.kind]} · Data considerada: {formatDate(detail.date)} · {formatCurrency(detail.amount)}</p>{detail.category ? <p>Categoria: {detail.category}</p> : null}{detail.kind === 'ADJUSTMENT' ? <p>Saldo antes: {formatCurrency(detail.previousBalance)} · Saldo informado no ajuste: {formatCurrency(detail.newBalance)}</p> : null}<Link className="secondary-button inline-button" to={detail.kind === 'ADJUSTMENT' ? '/contas' : '/movimentacoes?accountId=' + accountId + (detail.transactionId ? '&q=' + encodeURIComponent(detail.description) : '&mode=transfer')}>Abrir para revisar</Link></section> : null}
          </section>
          {current.pending.length ? <section className="editor-card"><h2>Pendentes do período</h2><p>Estes lançamentos ainda não alteram o saldo calculado.</p>{current.pending.map((item) => <p key={item.id}><Link to={'/movimentacoes?accountId=' + accountId + '&q=' + encodeURIComponent(item.description)}>{item.description}</Link> · {formatCurrency(item.amount)}</p>)}</section> : null}
          <section className="editor-card reconciliation-history"><h2>Histórico de revisões</h2>{!current.reviews.length ? <p>Este mês ainda não tem revisão registrada.</p> : current.reviews.map((review) => <details key={review.id}><summary>{new Date(review.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {review.stale ? 'Desatualizada' : 'Histórico correspondente'} · diferença {formatCurrency(review.difference)}</summary><p>Banco: {formatCurrency(review.bankBalance)} · Calculado na revisão: {formatCurrency(review.closingBalance)}</p>{review.justification ? <p>Justificativa: {review.justification}</p> : null}<p>{review.snapshot.movements.length} movimento(s) registrados na conferência.</p>{review.snapshot.movements.map((item) => <p key={item.id}>{formatDate(item.date)} · {item.description} · {formatCurrency(item.amount)}</p>)}</details>)}</section>
        </>
      )}
    </div>
  )
}
