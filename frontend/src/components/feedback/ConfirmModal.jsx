import { useEffect, useRef } from 'react'

export function ConfirmModal({
  open,
  title,
  message,
  cancelLabel = 'Cancelar',
  confirmLabel = 'Confirmar',
  destructive = false,
  loading = false,
  icon,
  onCancel,
  onConfirm,
}) {
  const cancelButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    cancelButtonRef.current?.focus()
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [loading, onCancel, open])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) onCancel()
    }}>
      <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message">
        {icon ? <span className={`confirm-modal-icon ${destructive ? 'is-destructive' : ''}`} aria-hidden="true">{icon}</span> : null}
        <div>
          <h2 id="confirm-modal-title">{title}</h2>
          <p id="confirm-modal-message">{message}</p>
        </div>
        <div className="confirm-modal-actions">
          <button ref={cancelButtonRef} className="secondary-button" type="button" disabled={loading} onClick={onCancel}>{cancelLabel}</button>
          <button className={destructive ? 'danger-button' : 'primary-button'} type="button" disabled={loading} onClick={onConfirm}>
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
