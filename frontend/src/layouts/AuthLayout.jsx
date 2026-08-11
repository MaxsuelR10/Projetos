import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <main className="auth-layout">
      <section className="brand-panel" aria-label="Controle de Finanças">
        <div className="brand-mark" aria-hidden="true">
          <span>$</span>
        </div>
        <div>
          <p className="eyebrow">Controle de Finanças</p>
          <h1>Clareza para cuidar do que importa.</h1>
          <p className="brand-copy">
            Um espaço privado para organizar as finanças da sua família, sem
            serviços pagos ou compartilhamento com terceiros.
          </p>
        </div>
        <p className="privacy-note">
          <span aria-hidden="true">●</span> Seus dados permanecem no seu ambiente.
        </p>
      </section>

      <section className="auth-content">
        <Outlet />
      </section>
    </main>
  )
}
