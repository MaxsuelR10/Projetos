import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authService } from '../services/auth.service.js'
import { AuthContext } from './auth-context.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('checking')
  const sessionRequestRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    if (!sessionRequestRef.current) {
      sessionRequestRef.current = authService.me()
    }

    sessionRequestRef.current
      .then((session) => {
        if (!isMounted) return
        setUser(session.authenticated ? session.user : null)
        setStatus(session.authenticated ? 'authenticated' : 'unauthenticated')
      })
      .catch(() => {
        if (!isMounted) return
        setUser(null)
        setStatus('unauthenticated')
      })

    return () => {
      isMounted = false
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const authenticatedUser = await authService.login(credentials)
    setUser(authenticatedUser)
    setStatus('authenticated')
    return authenticatedUser
  }, [])

  const register = useCallback(async (data) => {
    const authenticatedUser = await authService.register(data)
    setUser(authenticatedUser)
    setStatus('authenticated')
    return authenticatedUser
  }, [])

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } finally {
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  const value = useMemo(
    () => ({ user, status, isLoading: status === 'checking', isAuthenticated: status === 'authenticated', login, register, logout }),
    [user, status, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
