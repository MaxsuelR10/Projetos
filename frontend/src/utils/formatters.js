export function formatCurrency(value, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))
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
