import { api } from './api.js'
export const dashboardService = {
  async get(startDate, endDate = startDate, months = 6, expenseFrom, expenseTo) {
    return (
      await api.get('/dashboard', {
        params: { startDate, endDate, months, expenseFrom, expenseTo },
      })
    ).data;
  },
};
