import { useContext } from 'react'
import { ConfirmContext } from '../contexts/confirm-context.js'

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) throw new Error('useConfirm deve ser usado dentro de ConfirmProvider')
  return context
}
