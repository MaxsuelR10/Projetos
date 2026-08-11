import { api } from './api.js'

export const categoryService = {
  async list(status = 'all') {
    const response = await api.get('/categories', { params: { status } })
    return response.data.categories
  },

  async create(data) {
    const response = await api.post('/categories', data)
    return response.data.category
  },

  async update(id, data) {
    const response = await api.patch(`/categories/${id}`, data)
    return response.data.category
  },

  async remove(id) {
    await api.delete(`/categories/${id}`)
  },

  async createSubcategory(categoryId, data) {
    const response = await api.post(`/categories/${categoryId}/subcategories`, data)
    return response.data.subcategory
  },

  async updateSubcategory(categoryId, id, data) {
    const response = await api.patch(`/categories/${categoryId}/subcategories/${id}`, data)
    return response.data.subcategory
  },

  async removeSubcategory(categoryId, id) {
    await api.delete(`/categories/${categoryId}/subcategories/${id}`)
  },
}
