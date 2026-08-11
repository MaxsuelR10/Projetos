import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'

const navigation = [
  { to: '/', label: 'Início', symbol: '⌂', end: true },
  { to: '/contas', label: 'Contas', symbol: '◫' },
  { to: '/categorias', label: 'Categorias', symbol: '◇' },
  { to: '/movimentacoes', label: 'Movimentos', symbol: '↕' },
  { to: '/cartoes', label: 'Cartões', symbol: '▣' },
  { to: '/recorrencias', label: 'Planejar', symbol: '↻' },
]

export function AppLayout() {
  const { user, logout } = useAuth()

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

      <nav className="desktop-nav" aria-label="Navegação principal">
        {navigation.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            <span aria-hidden="true">{item.symbol}</span>{item.label}
          </NavLink>
        ))}
      </nav>

      <main className="app-content">
        <Outlet />
      </main>

      <nav className="mobile-nav" aria-label="Navegação principal">
        {navigation.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            <span aria-hidden="true">{item.symbol}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
