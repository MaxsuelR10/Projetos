export function formatCurrency(value, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))
}

export function parseCurrency(value) {
  const rawValue = String(value ?? '').trim().replace(/R\$\s?/g, '').replace(/\s/g, '')
  // Values loaded from the API use a decimal point (e.g. "56.61"), while the
  // currency field uses Brazilian formatting (e.g. "R$ 56,61"). Only remove
  // dots when a comma confirms that they are thousands separators.
  const normalized = rawValue.includes(',')
    ? rawValue.replace(/\./g, '').replace(',', '.')
    : rawValue
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount.toFixed(2) : ''
}

export function formatCurrencyInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(digits) / 100)
}

export function formatDate(value) {
  return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value)) : ''
}

const accountTypeLabels = {
  CHECKING: 'Conta corrente',
  DIGITAL: 'Conta digital',
  SAVINGS: 'Poupança',
  CASH: 'Dinheiro',
  WALLET: 'Carteira',
  INVESTMENT: 'Investimentos',
  OTHER: 'Outra conta',
}

export function formatAccountType(type) {
  return accountTypeLabels[type] || type
}
