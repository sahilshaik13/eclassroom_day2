import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import toast from 'react-hot-toast'
import type { ApiResponse } from '@/types'
import { useAuthStore } from '@/stores/authStore'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000') + '/api/v1'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (reason?: any) => void
}> = []

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

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
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`
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
  async (err: AxiosError) => {
    const originalRequest = err.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const onAuthPage = window.location.pathname.startsWith('/auth')

    if (err.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (onAuthPage) return Promise.reject(err)

      const state = useAuthStore.getState()
      
      // Check absolute session expiration constraint.
      if (!state.loginTimestamp || (Date.now() - state.loginTimestamp > state.getRoleExpirationMs())) {
        state.clearSession()
        window.dispatchEvent(new Event('eclassroom-logout'))
        return Promise.reject(err)
      }

      const refreshToken = state.refreshToken || localStorage.getItem('refresh_token')
      if (!refreshToken) {
        state.clearSession()
        window.dispatchEvent(new Event('eclassroom-logout'))
        return Promise.reject(err)
      }

      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = 'Bearer ' + token
            return api(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const refreshResponse = await axios.post<{ success: true; data: { access_token: string; refresh_token: string } }>(
          `${BASE_URL}/auth/refresh`,
          { refresh_token: refreshToken }
        )

        const { access_token, refresh_token } = refreshResponse.data.data
        state.updateTokens(access_token, refresh_token)
        
        processQueue(null, access_token)
        originalRequest.headers.Authorization = `Bearer ${access_token}`
        
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError as Error, null)
        state.clearSession()
        window.dispatchEvent(new Event('eclassroom-logout'))
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    if (err.response?.status === 401) {
      // In case retry fails or no token
      useAuthStore.getState().clearSession()
      window.dispatchEvent(new Event('eclassroom-logout'))
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