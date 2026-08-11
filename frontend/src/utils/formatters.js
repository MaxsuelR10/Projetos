export function formatCurrency(value, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))
}

export function parseCurrency(value) {
  const normalized = String(value ?? '').trim().replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')
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
