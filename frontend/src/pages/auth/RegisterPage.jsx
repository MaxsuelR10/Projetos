import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormField } from '../../components/forms/FormField.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { getApiError } from '../../utils/get-api-error.js'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    currency: 'BRL',
  })
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
      await register(form)
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-heading">
        <p className="eyebrow">Primeiro acesso</p>
        <h2>Crie sua conta</h2>
        <p>Você terá suas próprias contas e categorias financeiras.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {error ? (
          <div className="form-alert" role="alert">
            {error}
          </div>
        ) : null}

        <FormField
          id="name"
          label="Nome"
          type="text"
          autoComplete="name"
          placeholder="Como devemos chamar você?"
          value={form.name}
          onChange={updateField}
          minLength="2"
          required
        />
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
          hint="Use ao menos 8 caracteres, com letras e números."
          type="password"
          autoComplete="new-password"
          placeholder="Crie uma senha segura"
          value={form.password}
          onChange={updateField}
          minLength="8"
          maxLength="72"
          required
        />

        <label className="form-field" htmlFor="currency">
          <span>Moeda principal</span>
          <select
            id="currency"
            name="currency"
            value={form.currency}
            onChange={updateField}
          >
            <option value="BRL">Real brasileiro (BRL)</option>
          </select>
        </label>

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Criando conta...' : 'Criar minha conta'}
        </button>
      </form>

      <p className="auth-switch">
        Já possui uma conta? <Link to="/login">Entrar</Link>
      </p>
    </div>
  )
}
