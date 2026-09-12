import { api } from './api.js'

export const importService = {
  async previewCsv(accountId, content) {
    const response = await api.post('/imports/csv/preview', { accountId, content })
    return response.data
  },

  async commitCsv(accountId, rows, paymentMethod = 'OTHER', creditCardId = null) {
    const response = await api.post('/imports/csv/commit', { accountId, paymentMethod, creditCardId, rows })
    return response.data
  },
}
