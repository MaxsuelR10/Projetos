import { useEffect, useRef } from 'react'

export function ConfirmModal({
  open,
  title,
  message,
  cancelLabel = 'Cancelar',
  confirmLabel = 'Confirmar',
  destructive = false,
  loading = false,
  loadingLabel = 'Aguarde...',
  icon,
  onCancel,
  onConfirm,
}) {
  const cancelButtonRef = useRef(null)
  const modalRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current = document.activeElement
    cancelButtonRef.current?.focus()
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !loading) onCancel()
      if (event.key !== 'Tab') return
      const focusable = modalRef.current?.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [loading, onCancel, open])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) onCancel()
    }}>
      <section ref={modalRef} className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message">
        {icon ? <span className={`confirm-modal-icon ${destructive ? 'is-destructive' : ''}`} aria-hidden="true">{icon}</span> : null}
        <div>
          <h2 id="confirm-modal-title">{title}</h2>
          <p id="confirm-modal-message">{message}</p>
        </div>
        <div className="confirm-modal-actions">
          <button ref={cancelButtonRef} className="secondary-button" type="button" disabled={loading} onClick={onCancel}>{cancelLabel}</button>
          <button className={destructive ? 'danger-button' : 'primary-button'} type="button" disabled={loading} onClick={onConfirm}>
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
