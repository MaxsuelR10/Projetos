export function FormField({ label, id, hint, ...inputProps }) {
  return (
    <label className="form-field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} name={id} {...inputProps} />
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}
