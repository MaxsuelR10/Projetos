import { api } from './api.js'

export const accountService = {
  async list(status = 'all') {
    const response = await api.get('/accounts', { params: { status } })
    return response.data.accounts
  },

  async create(data) {
    const response = await api.post('/accounts', data)
    return response.data.account
  },

  async update(id, data) {
    const response = await api.patch(`/accounts/${id}`, data)
    return response.data.account
  },

  async adjustBalance(id, currentBalance) {
    const response = await api.patch(`/accounts/${id}/balance`, { currentBalance })
    return response.data.account
  },

  async remove(id) {
    await api.delete(`/accounts/${id}`)
  },
}
