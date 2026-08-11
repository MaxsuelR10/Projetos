import { api } from './api.js'

export const transferService = {
  async list(params = {}) {
    const response = await api.get('/transfers', { params })
    return response.data.transfers
  },

  async create(data) {
    const response = await api.post('/transfers', data)
    return response.data.transfer
  },

  async reverse(id) {
    const response = await api.delete(`/transfers/${id}`)
    return response.data.transfer
  },
}
