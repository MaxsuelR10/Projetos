import { formatCurrency, formatCurrencyInput } from '../../utils/formatters.js'

export function CurrencyInput({ name, value, onChange, ...props }) {
  function handleChange(event) {
    onChange({ target: { name, value: formatCurrencyInput(event.target.value) } })
  }

  const rawValue = String(value ?? '')
  const displayValue = rawValue.includes('R$') ? formatCurrencyInput(rawValue) : rawValue === '' ? '' : formatCurrency(rawValue)
  return <input name={name} value={displayValue} onChange={handleChange} inputMode="numeric" placeholder="R$ 0,00" {...props} />
}
