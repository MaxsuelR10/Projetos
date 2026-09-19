import { useCallback, useEffect, useState } from 'react'
import { ActionMenu } from '../components/actions/ActionMenu.jsx'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { FormDrawer } from '../components/feedback/FormDrawer.jsx'
import { CurrencyInput } from '../components/forms/CurrencyInput.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useConfirm } from '../hooks/useConfirm.js'
import { useToast } from '../hooks/useToast.js'
import { wishService } from '../services/wish.service.js'
import { formatCurrency, formatDate, parseCurrency } from '../utils/formatters.js'
import { getApiError } from '../utils/get-api-error.js'

const emptyWish = { name: '', amount: '', url: '', notes: '' }
const emptyReminder = { title: '', dueDate: '', amount: '', notes: '' }

function WishCard({ item, currency, onPurchase, onRestore, onDelete, busy }) {
  const purchased = item.status === 'PURCHASED'
  return <article className={`wish-card ${purchased ? 'is-complete' : ''}`}>
    <div className="wish-card-main">
      <div className="wish-icon" aria-hidden="true">⌁</div>
      <div>
        <div className="wish-title-row"><h3>{item.name}</h3>{purchased ? <span className="status-tag">Comprado</span> : null}</div>
        <strong>{formatCurrency(item.amount, currency)}</strong>
        {item.notes ? <p>{item.notes}</p> : null}
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer">Abrir link do produto <span aria-hidden="true">↗</span></a> : null}
      </div>
    </div>
    <ActionMenu label={`Ações para ${item.name}`} showPrimary={false} items={[
      { label: purchased ? 'Voltar aos desejos' : 'Marcar como comprado', onSelect: purchased ? onRestore : onPurchase, disabled: busy },
      { label: 'Excluir', onSelect: onDelete, destructive: true, disabled: busy },
    ]} />
  </article>
}

function ReminderCard({ item, currency, onDone, onRestore, onDelete, busy }) {
  const overdue = !item.isDone && item.dueDate && new Date(`${item.dueDate.slice(0, 10)}T00:00:00`) < new Date(new Date().toDateString())
  return <article className={`reminder-card ${item.isDone ? 'is-complete' : ''}`}>
    <div className="reminder-marker" aria-hidden="true">{item.isDone ? '✓' : '◷'}</div>
    <div className="reminder-details">
      <div className="wish-title-row"><h3>{item.title}</h3>{overdue ? <span className="overdue-tag">Em atraso</span> : item.isDone ? <span className="status-tag">Concluído</span> : null}</div>
      <div className="reminder-meta">{item.dueDate ? <span>Vence em {formatDate(item.dueDate)}</span> : <span>Sem data definida</span>}{item.amount ? <strong>{formatCurrency(item.amount, currency)}</strong> : null}</div>
      {item.notes ? <p>{item.notes}</p> : null}
    </div>
    <ActionMenu label={`Ações para ${item.title}`} showPrimary={false} items={[
      { label: item.isDone ? 'Marcar como pendente' : 'Marcar como concluído', onSelect: item.isDone ? onRestore : onDone, disabled: busy },
      { label: 'Excluir', onSelect: onDelete, destructive: true, disabled: busy },
    ]} />
  </article>
}

export function WishesPage() {
  const { user } = useAuth()
  const toast = useToast()
  const requestConfirmation = useConfirm()
  const [wishes, setWishes] = useState([])
  const [reminders, setReminders] = useState([])
  const [drawer, setDrawer] = useState('')
  const [wishForm, setWishForm] = useState(emptyWish)
  const [reminderForm, setReminderForm] = useState(emptyReminder)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await wishService.list()
      setWishes(data.wishes)
      setReminders(data.reminders)
      setError('')
    } catch (requestError) { setError(getApiError(requestError)) }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => {
    const timerId = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timerId)
  }, [load])

  function closeDrawer() { setDrawer(''); setWishForm(emptyWish); setReminderForm(emptyReminder); setError('') }

  async function submitWish(event) {
    event.preventDefault()
    const amount = parseCurrency(wishForm.amount)
    if (!amount) return setError('Informe o valor do item.')
    setIsSubmitting(true); setError('')
    try {
      const created = await wishService.createWish({ name: wishForm.name, amount, url: wishForm.url || null, notes: wishForm.notes || null })
      setWishes((items) => [created, ...items])
      toast.success('Item adicionado à lista de desejos.')
      closeDrawer()
    } catch (requestError) { setError(getApiError(requestError)) }
    finally { setIsSubmitting(false) }
  }

  async function submitReminder(event) {
    event.preventDefault()
    const amount = reminderForm.amount ? parseCurrency(reminderForm.amount) : null
    if (reminderForm.amount && !amount) return setError('Informe um valor válido ou deixe o campo em branco.')
    setIsSubmitting(true); setError('')
    try {
      const created = await wishService.createReminder({ title: reminderForm.title, dueDate: reminderForm.dueDate || null, amount, notes: reminderForm.notes || null })
      setReminders((items) => [...items, created].sort((a, b) => Number(a.isDone) - Number(b.isDone) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))))
      toast.success('Lembrete de pagamento adicionado.')
      closeDrawer()
    } catch (requestError) { setError(getApiError(requestError)) }
    finally { setIsSubmitting(false) }
  }

  async function changeWish(item, status) {
    setBusyId(item.id); setError('')
    try {
      const updated = await wishService.updateWish(item.id, status)
      setWishes((items) => items.map((current) => current.id === item.id ? updated : current))
      toast.success(status === 'PURCHASED' ? 'Item marcado como comprado.' : 'Item devolvido à lista de desejos.')
    } catch (requestError) { setError(getApiError(requestError)) }
    finally { setBusyId(null) }
  }

  async function changeReminder(item, isDone) {
    setBusyId(item.id); setError('')
    try {
      const updated = await wishService.updateReminder(item.id, isDone)
      setReminders((items) => items.map((current) => current.id === item.id ? updated : current))
      toast.success(isDone ? 'Lembrete marcado como concluído.' : 'Lembrete reaberto.')
    } catch (requestError) { setError(getApiError(requestError)) }
    finally { setBusyId(null) }
  }

  async function deleteItem(item, type) {
    const label = type === 'wish' ? 'item da lista de desejos' : 'lembrete'
    const confirmed = await requestConfirmation({ title: `Excluir ${label}?`, message: `“${type === 'wish' ? item.name : item.title}” será removido definitivamente.`, confirmLabel: 'Excluir', destructive: true, icon: '!' })
    if (!confirmed) return
    setBusyId(item.id); setError('')
    try {
      if (type === 'wish') { await wishService.deleteWish(item.id); setWishes((items) => items.filter((current) => current.id !== item.id)) }
      else { await wishService.deleteReminder(item.id); setReminders((items) => items.filter((current) => current.id !== item.id)) }
      toast.success('Registro excluído.')
    } catch (requestError) { setError(getApiError(requestError)) }
    finally { setBusyId(null) }
  }

  const activeWishes = wishes.filter((item) => item.status === 'ACTIVE')
  const purchasedWishes = wishes.filter((item) => item.status === 'PURCHASED')
  const pendingReminders = reminders.filter((item) => !item.isDone)
  const completedReminders = reminders.filter((item) => item.isDone)

  return <section className="page-stack wishes-page">
    <div className="page-heading with-action"><div><p className="eyebrow">Desejos e lembretes</p><h1>Lista de desejos</h1><p>Guarde objetivos de compra e lembretes de pagamento. O assistente também considera seus desejos nas análises.</p></div><div className="wish-heading-actions"><button className="secondary-button inline-button" type="button" onClick={() => setDrawer('reminder')}>+ Adicionar anotação</button><button className="primary-button inline-button" type="button" onClick={() => setDrawer('wish')}>+ Adicionar item</button></div></div>
    {error ? <div className="form-alert" role="alert">{error}</div> : null}

    {drawer === 'wish' ? <FormDrawer open eyebrow="Novo desejo" title="Adicionar à lista de desejos" onClose={closeDrawer}><form className="entity-form" onSubmit={submitWish}><label className="form-field"><span>Nome do item</span><input value={wishForm.name} onChange={(event) => setWishForm((form) => ({ ...form, name: event.target.value }))} required minLength="2" maxLength="160" placeholder="Ex.: Smart TV 55 polegadas" /></label><label className="form-field"><span>Valor</span><CurrencyInput value={wishForm.amount} onChange={(event) => setWishForm((form) => ({ ...form, amount: event.target.value }))} required /></label><label className="form-field form-field-wide"><span>Link do produto</span><input type="url" value={wishForm.url} onChange={(event) => setWishForm((form) => ({ ...form, url: event.target.value }))} maxLength="2048" placeholder="https://www.mercadolivre.com.br/..." /></label><label className="form-field form-field-wide"><span>Anotação (opcional)</span><textarea value={wishForm.notes} onChange={(event) => setWishForm((form) => ({ ...form, notes: event.target.value }))} maxLength="5000" rows="3" placeholder="Ex.: esperar promoção de Black Friday" /></label><button className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Adicionar desejo'}</button></form></FormDrawer> : null}
    {drawer === 'reminder' ? <FormDrawer open eyebrow="Novo lembrete" title="Adicionar anotação de pagamento" onClose={closeDrawer}><form className="entity-form" onSubmit={submitReminder}><label className="form-field"><span>O que precisa lembrar?</span><input value={reminderForm.title} onChange={(event) => setReminderForm((form) => ({ ...form, title: event.target.value }))} required minLength="2" maxLength="160" placeholder="Ex.: Pagar internet" /></label><label className="form-field"><span>Data de vencimento</span><input type="date" value={reminderForm.dueDate} onChange={(event) => setReminderForm((form) => ({ ...form, dueDate: event.target.value }))} /></label><label className="form-field"><span>Valor (opcional)</span><CurrencyInput value={reminderForm.amount} onChange={(event) => setReminderForm((form) => ({ ...form, amount: event.target.value }))} /></label><label className="form-field form-field-wide"><span>Anotação (opcional)</span><textarea value={reminderForm.notes} onChange={(event) => setReminderForm((form) => ({ ...form, notes: event.target.value }))} maxLength="5000" rows="3" placeholder="Ex.: boleto enviado por e-mail" /></label><button className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Adicionar lembrete'}</button></form></FormDrawer> : null}

    <section className="wish-section"><div className="section-heading"><div><p className="eyebrow">Objetivos de compra</p><h2>Meus desejos</h2></div><span className="section-count">{activeWishes.length} {activeWishes.length === 1 ? 'item' : 'itens'} ativo{activeWishes.length === 1 ? '' : 's'}</span></div>{isLoading ? <p className="loading-inline">Carregando desejos...</p> : null}{!isLoading && !activeWishes.length ? <EmptyState title="Sua lista está vazia" description="Adicione algo que você quer comprar para acompanhar o valor e consultar depois." action={<button className="primary-button inline-button" type="button" onClick={() => setDrawer('wish')}>Adicionar item</button>} /> : null}{activeWishes.length ? <div className="wish-list">{activeWishes.map((item) => <WishCard key={item.id} item={item} currency={user.currency} busy={busyId === item.id} onPurchase={() => changeWish(item, 'PURCHASED')} onRestore={() => changeWish(item, 'ACTIVE')} onDelete={() => deleteItem(item, 'wish')} />)}</div> : null}{purchasedWishes.length ? <details className="completed-records"><summary>Comprados ({purchasedWishes.length})</summary><div className="wish-list">{purchasedWishes.map((item) => <WishCard key={item.id} item={item} currency={user.currency} busy={busyId === item.id} onPurchase={() => changeWish(item, 'PURCHASED')} onRestore={() => changeWish(item, 'ACTIVE')} onDelete={() => deleteItem(item, 'wish')} />)}</div></details> : null}</section>

    <section className="wish-section"><div className="section-heading"><div><p className="eyebrow">Contas e compromissos</p><h2>Lembretes de pagamento</h2></div><button className="secondary-button inline-button" type="button" onClick={() => setDrawer('reminder')}>+ Adicionar anotação</button></div>{!isLoading && !pendingReminders.length ? <EmptyState title="Nenhum lembrete pendente" description="Anote vencimentos e pagamentos para não deixar nada passar." action={<button className="secondary-button inline-button" type="button" onClick={() => setDrawer('reminder')}>Criar lembrete</button>} /> : null}{pendingReminders.length ? <div className="reminder-list">{pendingReminders.map((item) => <ReminderCard key={item.id} item={item} currency={user.currency} busy={busyId === item.id} onDone={() => changeReminder(item, true)} onRestore={() => changeReminder(item, false)} onDelete={() => deleteItem(item, 'reminder')} />)}</div> : null}{completedReminders.length ? <details className="completed-records"><summary>Concluídos ({completedReminders.length})</summary><div className="reminder-list">{completedReminders.map((item) => <ReminderCard key={item.id} item={item} currency={user.currency} busy={busyId === item.id} onDone={() => changeReminder(item, true)} onRestore={() => changeReminder(item, false)} onDelete={() => deleteItem(item, 'reminder')} />)}</div></details> : null}</section>
  </section>
}
