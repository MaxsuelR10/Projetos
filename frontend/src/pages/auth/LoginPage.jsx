import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FormField } from '../../components/forms/FormField.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { getApiError } from '../../utils/get-api-error.js'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(form)
      navigate(location.state?.from || '/', { replace: true })
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-heading">
        <p className="eyebrow">Área segura</p>
        <h2>Boas-vindas</h2>
        <p>Entre para acessar seu controle financeiro.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {error ? (
          <div className="form-alert" role="alert">
            {error}
          </div>
        ) : null}

        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          value={form.email}
          onChange={updateField}
          required
        />
        <FormField
          id="password"
          label="Senha"
          type="password"
          autoComplete="current-password"
          placeholder="Sua senha"
          value={form.password}
          onChange={updateField}
          required
        />

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <p className="auth-switch">
        Ainda não possui uma conta? <Link to="/cadastro">Criar conta</Link>
      </p>
    </div>
  )
}
