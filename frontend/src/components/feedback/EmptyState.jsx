export function EmptyState({ title, description, action }) {
  return (
    <section className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">+</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  )
}
