import { api } from './api.js'

export const importService = {
  async previewCsv(accountId, content, type) {
    const response = await api.post('/imports/csv/preview', { accountId, content, ...(type ? { type } : {}) })
    return response.data
  },

  async commitCsv(importId, accountId, rows, ignoredCount, paymentMethod = 'OTHER', creditCardId = null) {
    const response = await api.post('/imports/csv/commit', { importId, accountId, paymentMethod, creditCardId, ignoredCount, rows })
    return response.data
  },
}
