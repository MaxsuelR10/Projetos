import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingScreen } from '../components/feedback/LoadingScreen.jsx'
import { useAuth } from '../hooks/useAuth.js'

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <LoadingScreen />

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
