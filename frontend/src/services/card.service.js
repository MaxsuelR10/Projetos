import { api } from './api.js'

export const cardService = {
  async list(status = 'active') { const response = await api.get('/cards', { params: { status } }); return response.data.cards },
  async create(data) { const response = await api.post('/cards', data); return response.data.card },
  async update(id, data) { const response = await api.patch(`/cards/${id}`, data); return response.data.card },
  async remove(id) { await api.delete(`/cards/${id}`) },
  async listInvoices(id) { const response = await api.get(`/cards/${id}/invoices`); return response.data.invoices },
  async listPurchases(id, includeCancelled = false) { const response = await api.get(`/cards/${id}/purchases`, { params: { includeCancelled } }); return response.data.purchases },
  async createPurchase(id, data) { const response = await api.post(`/cards/${id}/purchases`, data); return response.data.purchase },
  async cancelPurchase(id) { await api.delete(`/card-purchases/${id}`) },
  async payInvoice(id, data) { const response = await api.post(`/invoices/${id}/pay`, data); return response.data.invoice },
}
