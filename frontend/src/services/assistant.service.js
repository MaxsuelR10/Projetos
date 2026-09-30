import { api } from './api.js'

export const assistantService = {
  async ask(message, conversationId, signal) {
    return (await api.post('/assistant/chat', { message, ...(conversationId ? { conversationId } : {}) }, { signal })).data
  },

  async getLatestConversation() {
    return (await api.get('/assistant/conversations/latest')).data.conversation
  },
}
