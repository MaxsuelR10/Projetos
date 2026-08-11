import { useCallback, useEffect, useMemo, useState } from 'react'
import { authService } from '../services/auth.service.js'
import { AuthContext } from './auth-context.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    authService
      .me()
      .then((authenticatedUser) => {
        if (isMounted) setUser(authenticatedUser)
      })
      .catch(() => {
        if (isMounted) setUser(null)
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const authenticatedUser = await authService.login(credentials)
    setUser(authenticatedUser)
    return authenticatedUser
  }, [])

  const register = useCallback(async (data) => {
    const authenticatedUser = await authService.register(data)
    setUser(authenticatedUser)
    return authenticatedUser
  }, [])

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
