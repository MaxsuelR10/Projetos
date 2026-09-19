import { useEffect, useRef, useState } from 'react'
import { assistantService } from '../services/assistant.service.js'
import { getApiError } from '../utils/get-api-error.js'

const suggestions = [
  'Como estão minhas finanças neste mês?',
  'Quais são as minhas próximas faturas?',
  'Como está meu orçamento por categoria?',
  'Posso comprar uma TV de R$ 2.000 em 12 vezes?',
  'Consigo comprar algum item da minha lista de desejos?',
]

const welcomeMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Olá! Posso analisar seus saldos, orçamento, faturas, lista de desejos e simular compras usando os dados cadastrados. O que você quer entender?',
}

export function AssistantPage() {
  const [messages, setMessages] = useState([welcomeMessage])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const endOfConversationRef = useRef(null)

  useEffect(() => {
    endOfConversationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isSending])

  async function sendMessage(event) {
    event?.preventDefault()
    const message = draft.trim()
    if (!message || isSending) return

    const userMessage = { id: crypto.randomUUID(), role: 'user', content: message }
    setMessages((current) => [...current, userMessage])
    setDraft('')
    setIsSending(true)

    try {
      const result = await assistantService.ask(message)
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', content: result.reply },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant error', content: getApiError(error) },
      ])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <section className="page-stack assistant-page">
      <div className="page-heading">
        <p className="eyebrow">Análise inteligente · somente leitura</p>
        <h1>Assistente financeiro</h1>
        <p>Converse sobre seu orçamento, faturas, desejos e impacto de compras. As respostas usam os dados cadastrados no sistema.</p>
      </div>

      <section className="assistant-shell" aria-label="Conversa com o assistente financeiro">
        <div className="assistant-disclaimer" role="note">
          <span aria-hidden="true">⌁</span>
          <p>O assistente não movimenta dinheiro nem altera seus registros. Projeções são estimativas com base nos lançamentos atuais.</p>
        </div>

        <div className="assistant-messages" aria-live="polite" aria-busy={isSending}>
          {messages.map((message) => (
            <article className={`assistant-message is-${message.role.replace(' ', '-')}`} key={message.id}>
              <span className="assistant-avatar" aria-hidden="true">{message.role === 'user' ? 'Você' : 'IA'}</span>
              <p>{message.content}</p>
            </article>
          ))}
          {isSending ? (
            <article className="assistant-message is-assistant is-loading">
              <span className="assistant-avatar" aria-hidden="true">IA</span>
              <p><i /><i /><i /><span className="sr-only">O assistente está analisando seus dados.</span></p>
            </article>
          ) : null}
          <div ref={endOfConversationRef} />
        </div>

        {messages.length === 1 ? (
          <div className="assistant-suggestions" aria-label="Perguntas sugeridas">
            {suggestions.map((suggestion) => (
              <button key={suggestion} className="assistant-suggestion" type="button" onClick={() => setDraft(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <form className="assistant-composer" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="assistant-message">Sua pergunta</label>
          <textarea
            id="assistant-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                sendMessage(event)
              }
            }}
            placeholder="Ex.: Posso comprar uma TV de R$ 2.000 em 12x?"
            rows="2"
            maxLength="2000"
            disabled={isSending}
          />
          <button className="primary-button assistant-send" type="submit" disabled={isSending || !draft.trim()}>
            {isSending ? 'Analisando...' : 'Enviar'}
          </button>
        </form>
      </section>
    </section>
  )
}
