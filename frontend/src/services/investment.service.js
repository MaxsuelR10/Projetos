import { api } from './api.js'

export const investmentService = {
  async list() { return (await api.get('/investments')).data },
  async get(id) { return (await api.get(`/investments/${id}`)).data },
  async create(data) { return (await api.post('/investments', data)).data.investment },
  async update(id, data) { return (await api.patch(`/investments/${id}`, data)).data.investment },
  async remove(id) { await api.delete(`/investments/${id}`) },
  async addContribution(id, data) { return (await api.post(`/investments/${id}/contributions`, data)).data.contribution },
  async updateContribution(id, data) { return (await api.patch(`/investments/contributions/${id}`, data)).data.contribution },
  async removeContribution(id) { await api.delete(`/investments/contributions/${id}`) },
  async adoptLegacyGoal(investmentId, goalId) { return (await api.post(`/investments/${investmentId}/legacy-goals/${goalId}`)).data.investment },
  async refreshIndices() { return (await api.post('/investments/indices/refresh')).data },
}
