import { api } from './api.js'
export const dashboardService = {
  async get(startMonth, endMonth = startMonth, months = 6, expenseFrom, expenseTo) {
    return (
      await api.get('/dashboard', {
        params: { startMonth, endMonth, months, expenseFrom, expenseTo },
      })
    ).data;
  },
};
