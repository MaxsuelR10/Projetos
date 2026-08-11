import { formatCurrencyInput } from '../../utils/formatters.js'

export function CurrencyInput({ name, value, onChange, ...props }) {
  function handleChange(event) {
    onChange({ target: { name, value: formatCurrencyInput(event.target.value) } })
  }

  return <input name={name} value={formatCurrencyInput(value)} onChange={handleChange} inputMode="numeric" placeholder="R$ 0,00" {...props} />
}
