import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { accountService } from '../services/account.service.js'
import { categoryService } from '../services/category.service.js'
import { formatCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'
import { useAuth } from '../hooks/useAuth.js'

export function HomePage() {
  const { user } = useAuth()
  const [summary, setSummary] = useState({ isLoading: true, error: '', accounts: [], categories: [] })

  useEffect(() => {
    let active = true

    Promise.all([accountService.list('active'), categoryService.list('active')])
      .then(([accounts, categories]) => {
        if (active) setSummary({ isLoading: false, error: '', accounts, categories })
      })
      .catch((error) => {
        if (active) setSummary((current) => ({ ...current, isLoading: false, error: getApiError(error) }))
      })

    return () => { active = false }
  }, [])

  const balance = summary.accounts.reduce((total, account) => total + Number(account.currentBalance), 0)

  return (
    <section className="page-stack">
      <div className="page-heading welcome-heading">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1>Olá, {user.name.split(' ')[0]}.</h1>
          <p>Comece registrando suas contas e ajustando suas categorias.</p>
        </div>
      </div>

      {summary.error ? <div className="form-alert" role="alert">{summary.error}</div> : null}

      <section className="overview-grid" aria-label="Resumo inicial">
        <article className="overview-card overview-card-primary">
          <span>Saldo nas contas</span>
          <strong>{summary.isLoading ? '...' : formatCurrency(balance, user.currency)}</strong>
          <small>{summary.accounts.length} conta{summary.accounts.length === 1 ? '' : 's'} ativa{summary.accounts.length === 1 ? '' : 's'}</small>
        </article>
        <article className="overview-card">
          <span>Categorias ativas</span>
          <strong>{summary.isLoading ? '...' : summary.categories.length}</strong>
          <small>Receitas e despesas organizadas</small>
        </article>
      </section>

      <section className="setup-card">
        <div>
          <p className="eyebrow">Fase 2</p>
          <h2>Base financeira pronta para configurar.</h2>
          <p>Cadastre as contas que você usa e personalize as categorias da família antes de lançar movimentações.</p>
        </div>
        <div className="setup-actions">
          <Link className="primary-button inline-button" to="/movimentacoes">Novo lançamento</Link>
          <Link className="secondary-button inline-button" to="/categorias">Ver categorias</Link>
        </div>
      </section>
    </section>
  )
}
