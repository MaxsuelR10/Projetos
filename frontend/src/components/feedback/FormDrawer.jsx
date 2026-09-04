import { useEffect, useRef } from 'react'

export function FormDrawer({ open, title, eyebrow, children, onClose, wide = false }) {
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current = document.activeElement
    closeButtonRef.current?.focus()
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="form-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className={`form-drawer ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="form-drawer-title">
        <header className="form-drawer-header">
          <div>{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h2 id="form-drawer-title">{title}</h2></div>
          <button ref={closeButtonRef} className="icon-button" type="button" aria-label="Fechar formulário" onClick={onClose}>×</button>
        </header>
        <div className="form-drawer-body">{children}</div>
      </section>
    </div>
  )
}
