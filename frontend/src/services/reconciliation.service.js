import { api } from './api.js'

export const reconciliationService = {
  async preview(accountId, month, bankBalance) {
    const response = await api.get('/reconciliations', { params: { accountId, month, bankBalance } })
    return response.data
  },
  async save(data) {
    const response = await api.post('/reconciliations', data)
    return response.data
  },
}
