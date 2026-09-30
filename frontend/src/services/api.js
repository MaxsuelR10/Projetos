import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 70_000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})
