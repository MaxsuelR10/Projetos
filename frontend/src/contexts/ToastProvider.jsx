import { useCallback, useMemo, useState } from 'react'
import { ToastContext } from './toast-context.js'

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const show = useCallback((message, tone = 'success') => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500)
  }, [])
  const value = useMemo(() => ({ show, success: (message) => show(message), error: (message) => show(message, 'error'), warning: (message) => show(message, 'warning') }), [show])

  return <ToastContext.Provider value={value}>
    {children}
    <section className="toast-region" aria-live="polite" aria-label="Notificações">
      {toasts.map((toast) => <div className={`toast toast-${toast.tone}`} key={toast.id} role="status"><span>{toast.message}</span><button type="button" aria-label="Fechar notificação" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>×</button></div>)}
    </section>
  </ToastContext.Provider>
}
