import { api } from './api.js'
export const dashboardService = { async get(month, months = 6) { return (await api.get('/dashboard', { params: { month, months } })).data } }
