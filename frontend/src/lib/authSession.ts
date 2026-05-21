import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { syncSupabaseRealtimeAuth } from '@/lib/supabaseAuth'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080') + '/api/v1'

let bootstrapPromise: Promise<void> | null = null

/** Wait until Zustand persist has rehydrated from localStorage. */
export function waitForAuthHydration(): Promise<void> {
  if (useAuthStore.getState()._hasHydrated) return Promise.resolve()
  return new Promise((resolve) => {
    const unsub = useAuthStore.subscribe((state) => {
      if (state._hasHydrated) {
        unsub()
        resolve()
      }
    })
  })
}

function syncTokensToLocalStorage() {
  const { accessToken, refreshToken } = useAuthStore.getState()
  if (accessToken) localStorage.setItem('access_token', accessToken)
  if (refreshToken) localStorage.setItem('refresh_token', refreshToken)
}

function isAccessTokenExpiringSoon(token: string, skewSeconds = 90): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const expMs = Number(payload.exp) * 1000
    if (!Number.isFinite(expMs)) return true
    return Date.now() >= expMs - skewSeconds * 1000
  } catch {
    return true
  }
}

/**
 * After rehydrate, sync tokens and refresh the access token before the first API call.
 * Prevents a visible 401 on page refresh when the access token expired but refresh is valid.
 */
export async function bootstrapAuthSession(): Promise<void> {
  await waitForAuthHydration()
  const state = useAuthStore.getState()
  if (!state.isAuthenticated) {
    bootstrapPromise = null
    return
  }
  if (bootstrapPromise) return bootstrapPromise

  bootstrapPromise = (async () => {
    const current = useAuthStore.getState()
    if (!current.isAuthenticated) return

    syncTokensToLocalStorage()

    if (!current.lastActivityTimestamp) {
      current.touchActivity()
    }

    const accessToken = current.accessToken ?? localStorage.getItem('access_token')
    const refreshToken = current.refreshToken ?? localStorage.getItem('refresh_token')

    const shouldRefresh =
      !!refreshToken &&
      refreshToken !== 'manual-otp-verified' &&
      (!accessToken || isAccessTokenExpiringSoon(accessToken))

    if (shouldRefresh) {
      try {
        const refreshResponse = await axios.post<{
          success: true
          data: { access_token: string; refresh_token: string }
        }>(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken })

        const { access_token, refresh_token } = refreshResponse.data.data
        current.updateTokens(access_token, refresh_token)
      } catch {
        // Leave session in place; axios interceptor may still refresh per request.
      }
    }

    await syncSupabaseRealtimeAuth()
  })()

  return bootstrapPromise
}
