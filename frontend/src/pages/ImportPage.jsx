import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { accountService } from '../services/account.service.js'
import { importService } from '../services/import.service.js'
import { categoryService } from '../services/category.service.js'
import { formatCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'
import { notifyFinancialDataChanged } from '../utils/financial-events.js'
import { useToast } from '../hooks/useToast.js'

const IMPORT_BATCH_SIZE = 500

function normalizeAmount(value) {
  const input = String(value ?? '').trim()
  if (!input) return ''
  const numeric = input.replace(/[^\d,.-]/g, '')
  const normalized = numeric.includes(',') ? numeric.replace(/\./g, '').replace(',', '.') : numeric.replace(/,/g, '')
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : input
}

export function ImportPage() {
  const toast = useToast()
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [accountId, setAccountId] = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [invalidRows, setInvalidRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isReading, setIsReading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([accountService.list('active'), categoryService.list('active')])
      .then(([loadedAccounts, loadedCategories]) => {
        setAccounts(loadedAccounts)
        setCategories(loadedCategories)
        if (loadedAccounts.length === 1) setAccountId(loadedAccounts[0].id)
      })
      .catch((requestError) => setError(getApiError(requestError)))
      .finally(() => setIsLoading(false))
  }, [])

  const selectedRows = rows.filter((row) => row.selected && !row.duplicate)
  const totals = useMemo(() => selectedRows.reduce((accumulator, row) => ({
    income: accumulator.income + (row.type === 'INCOME' ? Number(row.amount) : 0),
    expense: accumulator.expense + (row.type === 'EXPENSE' ? Number(row.amount) : 0),
  }), { income: 0, expense: 0 }), [selectedRows])

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
      const preview = await importService.previewCsv(accountId, content)
      setFileName(file.name)
      setInvalidRows(preview.invalidRows)
      setRows(preview.rows.map((row) => ({ ...row, selected: !row.duplicate })))
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
      return next
    }))
  }

  function formatRowAmount(index) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, amount: normalizeAmount(row.amount) } : row))
  }

  async function commit() {
    if (!selectedRows.length) {
      showError('Selecione pelo menos um lançamento novo para importar.')
      return
    }
    if (selectedRows.some((row) => !row.categoryId)) {
      showError('Escolha uma categoria para todos os lançamentos selecionados.')
      return
    }
    const invalidAmount = selectedRows.some((row) => !/^\d{1,15}(?:\.\d{1,4})?$/.test(normalizeAmount(row.amount)) || Number(normalizeAmount(row.amount)) <= 0)
    if (invalidAmount) {
      showError('Revise os valores: cada lançamento selecionado precisa ter um valor maior que zero.')
      return
    }
    setIsImporting(true)
    setError('')
    try {
      const payload = selectedRows.map(({ date, description, amount, type, categoryId, duplicate }) => ({ date, description: description.trim(), amount: normalizeAmount(amount), type, categoryId, duplicate }))
      let imported = 0
      let skipped = 0
      for (let start = 0; start < payload.length; start += IMPORT_BATCH_SIZE) {
        const result = await importService.commitCsv(accountId, payload.slice(start, start + IMPORT_BATCH_SIZE))
        imported += result.imported
        skipped += result.skipped
      }
      notifyFinancialDataChanged()
      toast.success(`${imported} lançamento(s) importado(s).${skipped ? ` ${skipped} duplicado(s) foram ignorados.` : ''}`)
      setRows([])
      setInvalidRows([])
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
            <div><p className="eyebrow">2. Conferência</p><h2>{fileName}</h2><p>Itens já existentes são desmarcados automaticamente.</p></div>
            <button className="primary-button" type="button" disabled={isImporting || selectedRows.length === 0} onClick={commit}>{isImporting ? 'Importando...' : `Importar ${selectedRows.length} lançamento(s)`}</button>
          </div>
          <div className="import-summary"><span>{selectedRows.length} selecionado(s)</span><span className="income-text">+ {formatCurrency(totals.income)}</span><span className="expense-text">− {formatCurrency(totals.expense)}</span></div>
          {invalidRows.length ? <p className="import-warning">As linhas {invalidRows.join(', ')} não puderam ser lidas e serão ignoradas.</p> : null}
          <div className="import-table-wrap"><table className="import-table"><thead><tr><th>Importar</th><th>Data</th><th>Descrição</th><th>Tipo</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>
            {rows.map((row, index) => (
              <tr className={row.duplicate ? 'is-duplicate' : ''} key={row.rowNumber}>
                <td><input aria-label={`Selecionar ${row.description}`} type="checkbox" checked={row.selected} disabled={row.duplicate} onChange={(event) => updateRow(index, 'selected', event.target.checked)} /></td>
                <td><input aria-label={`Data de ${row.description}`} type="date" value={row.date} disabled={row.duplicate} onChange={(event) => updateRow(index, 'date', event.target.value)} /></td>
                <td><input aria-label="Descrição" type="text" value={row.description} maxLength="180" disabled={row.duplicate} onChange={(event) => updateRow(index, 'description', event.target.value)} />{row.duplicate ? <small className="duplicate-note">Já existe</small> : null}</td>
                <td><select value={row.type} disabled={row.duplicate} onChange={(event) => updateRow(index, 'type', event.target.value)}><option value="EXPENSE">Despesa</option><option value="INCOME">Receita</option></select></td>
                <td><select value={row.categoryId || ''} disabled={row.duplicate} onChange={(event) => updateRow(index, 'categoryId', event.target.value)}><option value="">Selecione</option>{categories.filter((category) => category.type === row.type).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></td>
                <td className={row.type === 'INCOME' ? 'income-text' : 'expense-text'}><input aria-label={`Valor de ${row.description}`} type="text" inputMode="decimal" value={row.amount} disabled={row.duplicate} onChange={(event) => updateRow(index, 'amount', event.target.value)} onBlur={() => formatRowAmount(index)} /></td>
              </tr>
            ))}
          </tbody></table></div>
        </section>
      ) : null}

      {!rows.length ? <section className="import-help"><h2>Como exportar</h2><p>No banco, procure por <strong>Extrato</strong>, <strong>Exportar</strong> ou <strong>Baixar CSV</strong>. Se houver opção de período, escolha apenas o período que deseja adicionar.</p><p>PDF de fatura é útil para consulta, mas não é usado nesta etapa porque sua estrutura varia e pode gerar lançamentos incorretos.</p></section> : null}
    </div>
  )
}
