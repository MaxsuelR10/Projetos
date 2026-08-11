import { api } from './api.js'

export const transactionService = {
  async list(params = {}) {
    const response = await api.get('/transactions', { params })
    return response.data
  },

  async create(data) {
    const response = await api.post('/transactions', data)
    return response.data.transaction
  },

  async update(id, data) {
    const response = await api.patch(`/transactions/${id}`, data)
    return response.data.transaction
  },

  async remove(id) {
    await api.delete(`/transactions/${id}`)
  },

  async cancel(id) {
    await api.patch(`/transactions/${id}/cancel`)
  },
}
