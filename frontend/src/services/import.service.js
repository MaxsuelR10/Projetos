import { api } from './api.js'

export const importService = {
  async inspectCsv(accountId, content, delimiter) {
    return (await api.post('/imports/csv/inspect', { accountId, content, ...(delimiter ? { delimiter } : {}) })).data
  },
  async listProfiles() { return (await api.get('/imports/profiles')).data.profiles },
  async saveProfile(name, headers, mapping) { return (await api.post('/imports/profiles', { name, headers, mapping })).data },
  async deleteProfile(id) { await api.delete('/imports/profiles/' + id) },
  async previewCsv(accountId, content, type, mapping) {
    const response = await api.post('/imports/csv/preview', { accountId, content, ...(type ? { type } : {}), ...(mapping ? { mapping } : {}) })
    return response.data
  },

  async commitCsv(importId, accountId, rows, ignoredCount, paymentMethod = 'OTHER', creditCardId = null) {
    const response = await api.post('/imports/csv/commit', { importId, accountId, paymentMethod, creditCardId, ignoredCount, rows })
    return response.data
  },
}
