import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import toast from 'react-hot-toast'
import type { ApiResponse } from '@/types'
import { useAuthStore } from '@/stores/authStore'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080') + '/api/v1'

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
  // Prefer in-memory store (accurate immediately after rehydrate / refresh)
  const fromStore = useAuthStore.getState().accessToken
  if (fromStore) return fromStore

  const direct = localStorage.getItem('access_token')
  if (direct) return direct

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
  // For PATCH / DELETE we don't need the full row back. PostgREST's
  // Prefer: return=minimal skips returning the body, cutting ~80% of
  // payload bytes on toggle / mark-seen / archive endpoints.
  const method = (config.method ?? '').toUpperCase()
  if ((method === 'PATCH' || method === 'DELETE') && !config.headers.Prefer) {
    config.headers.Prefer = 'return=minimal'
  }
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
    // Update activity on successful request
    useAuthStore.getState().touchActivity()
    return res
  },
  async (err: AxiosError) => {
    const originalRequest = err.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const onAuthPage = window.location.pathname.startsWith('/auth')

    if (err.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (onAuthPage) return Promise.reject(err)

      const state = useAuthStore.getState()
      
      // Check inactivity limit (skip when timestamp missing — e.g. legacy persisted session)
      const lastActivity = state.lastActivityTimestamp
      if (
        lastActivity != null &&
        Date.now() - lastActivity > state.getInactivityLimitMs()
      ) {
        state.clearSession()
        window.dispatchEvent(new Event('eclassroom-logout'))
        return Promise.reject(err)
      }
      if (lastActivity == null) {
        state.touchActivity()
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
        // Don't clear session on refresh error - let user retry or re-authenticate
        // state.clearSession()
        // window.dispatchEvent(new Event('eclassroom-logout'))
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    if (err.response?.status === 401) {
      // Don't auto-clear session on 401 - let RouteGuards handle auth state
      // useAuthStore.getState().clearSession()
      // window.dispatchEvent(new Event('eclassroom-logout'))
      return Promise.reject(err)
    }

    if (err.response?.status === 403) {
    }

    // Map FastAPI specific HTTPException detail object into expected error.message
    const responseData = err.response?.data as any;
    if (responseData?.detail?.message) {
      if (!responseData.error) responseData.error = {}
      responseData.error.message = responseData.detail.message
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