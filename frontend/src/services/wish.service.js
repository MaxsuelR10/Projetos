import { api } from './api.js'

export const wishService = {
  async list() { return (await api.get('/wishes')).data },
  async createWish(data) { return (await api.post('/wishes/items', data)).data.wish },
  async updateWish(id, data) { return (await api.patch(`/wishes/items/${id}`, data)).data.wish },
  async deleteWish(id) { await api.delete(`/wishes/items/${id}`) },
  async createReminder(data) { return (await api.post('/wishes/reminders', data)).data.reminder },
  async updateReminder(id, data) { return (await api.patch(`/wishes/reminders/${id}`, data)).data.reminder },
  async deleteReminder(id) { await api.delete(`/wishes/reminders/${id}`) },
}
