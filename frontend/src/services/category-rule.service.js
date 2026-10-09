import { api } from './api.js'

export const categoryRuleService = {
  async list(status = 'all') {
    const response = await api.get('/category-rules', { params: { status } })
    return response.data.rules
  },

  async create(data) {
    const response = await api.post('/category-rules', data)
    return response.data.rule
  },

  async update(id, data) {
    const response = await api.patch(`/category-rules/${id}`, data)
    return response.data.rule
  },

  async remove(id) {
    await api.delete(`/category-rules/${id}`)
  },
}
