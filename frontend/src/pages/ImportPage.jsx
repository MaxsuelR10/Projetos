import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { accountService } from '../services/account.service.js'
import { importService } from '../services/import.service.js'
import { categoryService } from '../services/category.service.js'
import { cardService } from '../services/card.service.js'
import { formatCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'
import { notifyFinancialDataChanged } from '../utils/financial-events.js'
import { useToast } from '../hooks/useToast.js'

const paymentMethods = [
  ['OTHER', 'Outro'],
  ['PIX', 'PIX'],
  ['DEBIT_CARD', 'Cartão de débito'],
  ['BOLETO', 'Boleto'],
  ['BANK_TRANSFER', 'Transferência bancária'],
  ['AUTOMATIC_DEBIT', 'Débito automático'],
  ['CASH', 'Dinheiro'],
  ['CREDIT_CARD', 'Cartão de crédito'],
]

function normalizeAmount(value) {
  const input = String(value ?? '').trim()
  if (!input) return ''
  const numeric = input.replace(/[^\d,.-]/g, '')
  const normalized = numeric.includes(',') ? numeric.replace(/\./g, '').replace(',', '.') : numeric.replace(/,/g, '')
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : input
}
function isRowReady(row) {
  const amount = normalizeAmount(row.amount)
  return /^\d{4}-\d{2}-\d{2}$/.test(row.date)
    && row.description.trim().length >= 2
    && row.description.trim().length <= 180
    && /^\d{1,15}(?:\.\d{1,4})?$/.test(amount)
    && Number(amount) > 0
    && Boolean(row.categoryId)
}

export function ImportPage() {
  const toast = useToast()
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [cards, setCards] = useState([])
  const [accountId, setAccountId] = useState('')
  const [importType, setImportType] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('OTHER')
  const [creditCardId, setCreditCardId] = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [importId, setImportId] = useState('')
  const [currentBalance, setCurrentBalance] = useState(0)
  const [result, setResult] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isReading, setIsReading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([accountService.list('active'), categoryService.list('active'), cardService.list('active')])
      .then(([loadedAccounts, loadedCategories, loadedCards]) => {
        setAccounts(loadedAccounts)
        setCategories(loadedCategories)
        setCards(loadedCards.filter((card) => card.type === 'CREDIT'))
        if (loadedAccounts.length === 1) setAccountId(loadedAccounts[0].id)
      })
      .catch((requestError) => setError(getApiError(requestError)))
      .finally(() => setIsLoading(false))
  }, [])

  const selectedRows = rows.filter((row) => row.selected)
  const totals = useMemo(() => selectedRows.reduce((accumulator, row) => ({
    income: accumulator.income + (row.type === 'INCOME' ? Number(row.amount) : 0),
    expense: accumulator.expense + (row.type === 'EXPENSE' ? Number(row.amount) : 0),
  }), { income: 0, expense: 0 }), [selectedRows])
  const projectedBalance = paymentMethod === 'CREDIT_CARD' ? Number(currentBalance) : Number(currentBalance) + totals.income - totals.expense
  const ignoredCount = rows.length - selectedRows.length

  function showError(message) {
    setError(message)
    toast.error(message)
  }

  async function readFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!accountId) {
      showError('Selecione a conta que recebeu este extrato antes de anexar o arquivo.')
      event.target.value = ''
      return
    }
    if (!/\.csv$/i.test(file.name)) {
      showError('Por enquanto, importe o arquivo CSV exportado pelo banco. PDFs podem ter campos inconsistentes.')
      event.target.value = ''
      return
    }
    if (file.size > 1_000_000) {
      showError('O arquivo deve ter no máximo 1 MB.')
      event.target.value = ''
      return
    }
    setIsReading(true)
    setError('')
    try {
      const content = await file.text()
      const preview = await importService.previewCsv(accountId, content, importType)
      setFileName(file.name)
      setImportId(preview.importId)
      setCurrentBalance(preview.account.currentBalance)
      setResult(null)
      setRows(preview.rows.map((row) => ({ ...row, selected: row.valid && !row.duplicate })))
      toast.success(`${preview.rows.length} lançamentos encontrados para conferência.`)
    } catch (requestError) {
      setRows([])
      showError(getApiError(requestError, 'Não foi possível ler este CSV.'))
    } finally {
      setIsReading(false)
      event.target.value = ''
    }
  }

  function updateRow(index, field, value) {
    setRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      const next = { ...row, [field]: value }
      if (field === 'type') {
        const fallback = categories.find((category) => category.type === value && category.name === 'Outros') || categories.find((category) => category.type === value)
        next.categoryId = fallback?.id || ''
        next.categoryName = fallback?.name || 'Sem categoria'
      }
      if (field === 'categoryId') next.categoryName = categories.find((category) => category.id === value)?.name || 'Sem categoria'
      next.valid = isRowReady(next)
      next.issues = next.valid ? [] : ['Revise os campos obrigatórios antes de incluir']
      if (!next.valid) next.selected = false
      return next
    }))
  }

  function formatRowAmount(index) {
    setRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      const next = { ...row, amount: normalizeAmount(row.amount) }
      next.valid = isRowReady(next)
      next.issues = next.valid ? [] : ['Revise os campos obrigatórios antes de incluir']
      if (!next.valid) next.selected = false
      return next
    }))
  }

  async function commit() {
    if (!selectedRows.length) {
      showError('Selecione pelo menos um lançamento novo para importar.')
      return
    }
    if (selectedRows.some((row) => !isRowReady(row))) {
      showError('Revise data, descrição, categoria e valor de todos os lançamentos selecionados.')
      return
    }
    if (paymentMethod === 'CREDIT_CARD' && !creditCardId) {
      showError('Selecione o cartão de crédito usado nestas compras.')
      return
    }
    if (paymentMethod === 'CREDIT_CARD' && selectedRows.some((row) => row.type !== 'EXPENSE')) {
      showError('Somente despesas podem ser importadas como compra no cartão de crédito.')
      return
    }
    setIsImporting(true)
    setError('')
    try {
      const payload = selectedRows.map(({ importKey, date, description, amount, type, categoryId, duplicate }) => ({
        importKey,
        date,
        description: description.trim(),
        amount: normalizeAmount(amount),
        type,
        categoryId,
        allowDuplicate: Boolean(duplicate),
      }))
      const importResult = await importService.commitCsv(importId, accountId, payload, ignoredCount, paymentMethod, creditCardId || null)
      notifyFinancialDataChanged()
      setResult(importResult)
      setCurrentBalance(importResult.balanceAfter)
      toast.success(`${importResult.imported} lançamento(s) importado(s) com segurança.`)
      setRows([])
      setImportId('')
      setFileName('')
    } catch (requestError) {
      showError(getApiError(requestError, 'Não foi possível concluir a importação.'))
    } finally {
      setIsImporting(false)
    }
  }

  if (isLoading) return <p className="loading-inline">Carregando importador...</p>

  return (
    <div className="page-stack">
      <section className="page-heading with-action">
        <div>
          <p className="eyebrow">Importação assistida</p>
          <h1>Importar extrato</h1>
          <p>Envie o CSV exportado pelo Nubank, Inter ou outro banco. Nada é lançado antes da sua conferência.</p>
        </div>
        <Link className="secondary-button inline-button" to="/movimentacoes">Ver movimentações</Link>
      </section>

      {error ? <section className="import-error" role="alert" aria-live="assertive"><div><strong>Não foi possível concluir a operação</strong><p>{error}</p></div><button type="button" aria-label="Fechar aviso de erro" onClick={() => setError('')}>×</button></section> : null}
      {result ? (
        <section className="import-result" role="status">
          <div><p className="eyebrow">Importação concluída</p><h2>{result.imported} lançamento(s) adicionado(s)</h2></div>
          <div className="import-result-counts">
            <span><strong>{result.imported}</strong> importados</span>
            <span><strong>{result.ignored}</strong> ignorados</span>
            <span><strong>{result.duplicates}</strong> duplicados</span>
            <span><strong>{result.rejected}</strong> recusados</span>
          </div>
          <p>Saldo atual da conta: <strong>{formatCurrency(result.balanceAfter)}</strong></p>
        </section>
      ) : null}

      <section className="import-card">
        <div>
          <h2>1. Selecione a conta e o arquivo</h2>
          <p>Use o extrato em CSV. O arquivo é lido para a importação e não fica armazenado no sistema.</p>
        </div>
        <div className="import-controls">
          <label className="form-field">
            <span>Conta do extrato</span>
            <select value={accountId} onChange={(event) => { setAccountId(event.target.value); setRows([]); setFileName('') }}>
              <option value="">Selecione</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Tipo dos lançamentos</span>
            <small>Detecte pelo sinal do valor ou force um único tipo para todo o arquivo.</small>
            <select value={importType} onChange={(event) => {
              const nextType = event.target.value
              setImportType(nextType)
              setRows([])
              setFileName('')
              if (nextType !== 'EXPENSE') {
                setPaymentMethod('OTHER')
                setCreditCardId('')
              }
            }}>
              <option value="EXPENSE">Despesas</option>
              <option value="">Detectar automaticamente</option>
              <option value="INCOME">Receitas</option>
            </select>
          </label>
          <label className="form-field">
            <span>Forma de pagamento</span>
            <select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setCreditCardId('') }}>
              {paymentMethods.filter(([value]) => importType === 'EXPENSE' || value !== 'CREDIT_CARD').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {paymentMethod === 'CREDIT_CARD' ? (
            <label className="form-field">
              <span>Cartão usado</span>
              <select value={creditCardId} onChange={(event) => setCreditCardId(event.target.value)} required>
                <option value="">Selecione o cartão</option>
                {cards.map((card) => <option key={card.id} value={card.id}>{card.name}{card.institution ? ` · ${card.institution}` : ''}</option>)}
              </select>
              {!cards.length ? <small>Cadastre o cartão Nubank na tela Cartões antes de importar.</small> : null}
            </label>
          ) : null}
          <label className="file-picker">
            <input type="file" accept=".csv,text/csv" onChange={readFile} disabled={isReading || !accountId} />
            <span>{isReading ? 'Lendo arquivo...' : 'Anexar CSV'}</span>
          </label>
        </div>
        {accounts.length === 0 ? <p className="form-alert">Crie uma conta antes de importar um extrato.</p> : null}
      </section>

      {rows.length > 0 ? (
        <section className="import-preview">
          <div className="section-heading">
            <div><p className="eyebrow">2. Conferência</p><h2>{fileName}</h2><p>Revise o impacto, corrija linhas e escolha exatamente o que deseja importar.</p></div>
            <button className="primary-button" type="button" disabled={isImporting || selectedRows.length === 0} onClick={commit}>{isImporting ? 'Importando...' : `Confirmar ${selectedRows.length} lançamento(s)`}</button>
          </div>
          <div className="import-impact-grid">
            <article><span>Saldo atual</span><strong>{formatCurrency(currentBalance)}</strong></article>
            <article><span>Entradas selecionadas</span><strong className="income-text">+ {formatCurrency(totals.income)}</strong></article>
            <article><span>Saídas selecionadas</span><strong className="expense-text">− {formatCurrency(totals.expense)}</strong></article>
            <article className={projectedBalance < 0 ? 'is-negative' : ''}><span>{paymentMethod === 'CREDIT_CARD' ? 'Saldo após importar no cartão' : 'Saldo estimado após importar'}</span><strong>{formatCurrency(projectedBalance)}</strong></article>
          </div>
          <div className="import-summary"><span>{selectedRows.length} selecionado(s)</span><span>{ignoredCount} ignorado(s)</span><span>{rows.filter((row) => row.duplicate).length} possível(is) duplicado(s)</span></div>
          {rows.some((row) => !row.valid) ? <p className="import-warning">Linhas com problema continuam visíveis: corrija os campos indicados para poder incluí-las.</p> : null}
          <div className="import-table-wrap"><table className="import-table"><thead><tr><th>Importar</th><th>Data</th><th>Descrição</th><th>Tipo</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>
            {rows.map((row, index) => (
              <tr className={[row.duplicate ? 'is-duplicate' : '', !row.valid ? 'is-invalid' : ''].filter(Boolean).join(' ')} key={row.importKey}>
                <td><input aria-label={`Selecionar ${row.description || `linha ${row.rowNumber}`}`} type="checkbox" checked={row.selected} disabled={!isRowReady(row)} onChange={(event) => updateRow(index, 'selected', event.target.checked)} /></td>
                <td><input aria-label={`Data de ${row.description || `linha ${row.rowNumber}`}`} type="date" value={row.date} onChange={(event) => updateRow(index, 'date', event.target.value)} /></td>
                <td>
                  <input aria-label="Descrição" type="text" value={row.description} maxLength="180" onChange={(event) => updateRow(index, 'description', event.target.value)} />
                  {row.duplicate ? <small className="duplicate-note">{row.duplicateReason}. Marque para importar mesmo assim.</small> : null}
                  {!row.valid ? <small className="invalid-note">{row.issues.join(' · ')}</small> : null}
                </td>
                <td><select value={row.type} onChange={(event) => updateRow(index, 'type', event.target.value)}><option value="EXPENSE">Despesa</option><option value="INCOME">Receita</option></select></td>
                <td><select value={row.categoryId || ''} onChange={(event) => updateRow(index, 'categoryId', event.target.value)}><option value="">Selecione</option>{categories.filter((category) => category.type === row.type).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></td>
                <td className={row.type === 'INCOME' ? 'income-text' : 'expense-text'}><input aria-label={`Valor de ${row.description || `linha ${row.rowNumber}`}`} type="text" inputMode="decimal" value={row.amount} onChange={(event) => updateRow(index, 'amount', event.target.value)} onBlur={() => formatRowAmount(index)} /></td>
              </tr>
            ))}
          </tbody></table></div>
        </section>
      ) : null}

      {!rows.length ? <section className="import-help"><h2>Como exportar</h2><p>No banco, procure por <strong>Extrato</strong>, <strong>Exportar</strong> ou <strong>Baixar CSV</strong>. Se houver opção de período, escolha apenas o período que deseja adicionar.</p><p>PDF de fatura é útil para consulta, mas não é usado nesta etapa porque sua estrutura varia e pode gerar lançamentos incorretos.</p></section> : null}
    </div>
  )
}
