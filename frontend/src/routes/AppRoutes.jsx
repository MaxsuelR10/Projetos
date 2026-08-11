import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthLayout } from '../layouts/AuthLayout.jsx'
import { AccountsPage } from '../pages/AccountsPage.jsx'
import { CategoriesPage } from '../pages/CategoriesPage.jsx'
import { CardsPage } from '../pages/CardsPage.jsx'
import { HomePage } from '../pages/HomePage.jsx'
import { TransactionsPage } from '../pages/TransactionsPage.jsx'
import { RecurrencesPage } from '../pages/RecurrencesPage.jsx'
import { LoginPage } from '../pages/auth/LoginPage.jsx'
import { RegisterPage } from '../pages/auth/RegisterPage.jsx'
import { ProtectedRoute } from './ProtectedRoute.jsx'
import { PublicOnlyRoute } from './PublicOnlyRoute.jsx'
import { AppLayout } from '../layouts/AppLayout.jsx'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<RegisterPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="/contas" element={<AccountsPage />} />
          <Route path="/categorias" element={<CategoriesPage />} />
          <Route path="/cartoes" element={<CardsPage />} />
          <Route path="/movimentacoes" element={<TransactionsPage />} />
          <Route path="/recorrencias" element={<RecurrencesPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
