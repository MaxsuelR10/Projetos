import { useContext } from 'react'
import { AuthContext } from '../contexts/auth-context.js'

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider')
  }

  return context
}
