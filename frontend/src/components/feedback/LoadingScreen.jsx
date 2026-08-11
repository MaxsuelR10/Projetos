export function LoadingScreen() {
  return (
    <main className="loading-screen" aria-live="polite" aria-busy="true">
      <span className="spinner" aria-hidden="true" />
      <p>Verificando sua sessão...</p>
    </main>
  )
}
