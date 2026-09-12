import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'

const desktopNavigation = [
  { to: '/', label: 'Início', symbol: '⌂', end: true },
  { to: '/movimentacoes', label: 'Movimentações', symbol: '↕' },
  { to: '/importar', label: 'Importar', symbol: '⇪' },
  { to: '/contas', label: 'Contas', symbol: '◫' },
  { to: '/cartoes', label: 'Cartões', symbol: '▣' },
  { to: '/recorrencias', label: 'Recorrências', symbol: '↻' },
  { to: '/planejamento', label: 'Metas', symbol: '◎' },
  { to: '/investimentos', label: 'Investimentos', symbol: '↗' },
  { to: '/categorias', label: 'Categorias', symbol: '◇' },
]

const mobilePrimaryNav = [
  { to: '/', label: 'Início', symbol: '⌂', end: true },
  { to: '/movimentacoes', label: 'Movimentos', symbol: '↕' },
  { to: '/contas', label: 'Contas', symbol: '◫' },
  { to: '/cartoes', label: 'Cartões', symbol: '▣' },
]

const moreNavItems = [
  { to: '/importar', label: 'Importar extrato', symbol: '⇪', desc: 'Anexar CSV do seu banco' },
  { to: '/recorrencias', label: 'Recorrências & Fixas', symbol: '↻', desc: 'Gastos e receitas programadas' },
  { to: '/planejamento', label: 'Metas Financeiras', symbol: '◎', desc: 'Objetivos e reservas' },
  { to: '/investimentos', label: 'Investimentos', symbol: '↗', desc: 'Patrimônio aplicado' },
  { to: '/categorias', label: 'Categorias', symbol: '◇', desc: 'Classificação de lançamentos' },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="app-brand" to="/" aria-label="Ir para o início">
          <span className="mini-brand-mark" aria-hidden="true">$</span>
          <span>Controle de Finanças</span>
        </NavLink>
        <div className="user-menu">
          <span className="user-initial" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
          <button className="text-button" type="button" onClick={logout}>Sair</button>
        </div>
      </header>

      {/* Desktop Navigation */}
      <nav className="desktop-nav" aria-label="Navegação principal">
        {desktopNavigation.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            <span aria-hidden="true">{item.symbol}</span>{item.label}
          </NavLink>
        ))}
      </nav>

      {/* Main Content */}
      <main className="app-content">
        <Outlet />
      </main>

      {/* Mobile Drawer Menu for "Mais" */}
      {isMoreMenuOpen ? (
        <div className="mobile-more-overlay" onClick={() => setIsMoreMenuOpen(false)}>
          <div className="mobile-more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-more-header">
              <h3>Mais recursos</h3>
              <button
                type="button"
                className="text-button"
                onClick={() => setIsMoreMenuOpen(false)}
                aria-label="Fechar menu"
              >
                ✕
              </button>
            </div>
            <div className="mobile-more-list">
              {moreNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="mobile-more-item"
                  onClick={() => setIsMoreMenuOpen(false)}
                >
                  <span className="more-item-symbol">{item.symbol}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.desc}</small>
                  </div>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Modern 5-tab Mobile Bottom Navigation */}
      <nav className="mobile-nav" aria-label="Navegação móvel">
        {mobilePrimaryNav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            <span aria-hidden="true">{item.symbol}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`mobile-nav-more-btn ${isMoreMenuOpen ? 'is-active' : ''}`}
          onClick={() => setIsMoreMenuOpen((curr) => !curr)}
        >
          <span aria-hidden="true">⋯</span>
          <span>Mais</span>
        </button>
      </nav>
    </div>
  )
}
