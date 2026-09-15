import { api } from './api.js'

export const importService = {
  async previewCsv(accountId, content, type) {
    const response = await api.post('/imports/csv/preview', { accountId, content, type })
    return response.data
  },

  async commitCsv(accountId, rows, paymentMethod = 'OTHER', creditCardId = null) {
    const response = await api.post('/imports/csv/commit', { accountId, paymentMethod, creditCardId, rows })
    return response.data
  },
}
