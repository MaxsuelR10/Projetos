import { api } from './api.js'

export const authService = {
  async register(data) {
    const response = await api.post('/auth/register', data)
    return response.data.user
  },

  async login(credentials) {
    const response = await api.post('/auth/login', credentials)
    return response.data.user
  },

  async me() {
    const response = await api.get('/auth/me')
    return response.data.user
  },

  async logout() {
    await api.post('/auth/logout')
  },
}
