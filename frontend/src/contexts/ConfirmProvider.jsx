import { useCallback, useMemo, useRef, useState } from 'react'
import { ConfirmModal } from '../components/feedback/ConfirmModal.jsx'
import { ConfirmContext } from './confirm-context.js'

export function ConfirmProvider({ children }) {
  const [options, setOptions] = useState(null)
  const resolverRef = useRef(null)

  const finish = useCallback((confirmed) => {
    resolverRef.current?.(confirmed)
    resolverRef.current = null
    setOptions(null)
  }, [])

  const requestConfirmation = useCallback((nextOptions) => new Promise((resolve) => {
    resolverRef.current?.(false)
    resolverRef.current = resolve
    setOptions(nextOptions)
  }), [])

  const value = useMemo(() => requestConfirmation, [requestConfirmation])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmModal
        open={Boolean(options)}
        title={options?.title}
        message={options?.message}
        cancelLabel={options?.cancelLabel}
        confirmLabel={options?.confirmLabel}
        destructive={options?.destructive}
        icon={options?.icon}
        onCancel={() => finish(false)}
        onConfirm={() => finish(true)}
      />
    </ConfirmContext.Provider>
  )
}
