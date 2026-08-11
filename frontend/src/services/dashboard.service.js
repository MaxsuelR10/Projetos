import { api } from './api.js'
export const dashboardService = { async get(month) { return (await api.get('/dashboard', { params: { month } })).data } }
