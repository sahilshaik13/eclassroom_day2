import axios, { AxiosError } from 'axios'
import toast from 'react-hot-toast'
import type { ApiResponse } from '@/types'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000') + '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

function getStoredToken(): string | null {
  // Primary: access_token is written synchronously by setSession/updateToken
  const direct = localStorage.getItem('access_token')
  if (direct) return direct

  // Fallback: read from Zustand persist key (may lag slightly after login)
  try {
    const raw = localStorage.getItem('eclassroom-auth')
    if (raw) {
      const parsed = JSON.parse(raw)
      return parsed?.state?.accessToken ?? null
    }
  } catch { }
  return null
}

api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => {
    const data = res.data as ApiResponse<unknown>
    if (!data.success) {
      const msg = (data as { success: false; error: { message: string } }).error.message
      return Promise.reject(new ApiClientError(
        (data as { success: false; error: { code: string } }).error.code,
        msg,
        res.status,
      ))
    }
    return res
  },
  (err: AxiosError) => {
    const onAuthPage = window.location.pathname.startsWith('/auth')

    if (err.response?.status === 401) {
      if (!onAuthPage) {
        localStorage.removeItem('eclassroom-auth')
        window.location.href = '/auth/login'
      }
      return Promise.reject(err)
    }
    if (err.response?.status === 403) {
      const body = err.response.data as { error?: { code?: string } }
      if (body?.error?.code === 'MFA_REQUIRED' && !onAuthPage) {
        window.location.href = '/auth/mfa-setup'
        return Promise.reject(err)
      }
    }
    if (err.response?.status === 429) {
      toast.error('Too many requests — please wait a moment.')
    }
    if (err.response?.status && err.response.status >= 500) {
      toast.error('Server error — please try again.')
    }
    return Promise.reject(err)
  }
)

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export default api