import { Navigate, Outlet } from 'react-router-dom'
import { LoadingScreen } from '../components/feedback/LoadingScreen.jsx'
import { useAuth } from '../hooks/useAuth.js'

export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (user) return <Navigate to="/" replace />

  return <Outlet />
}
