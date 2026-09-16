import { api } from './api.js'

export const assistantService = {
  async ask(message) {
    return (await api.post('/assistant/chat', { message })).data
  },
}
