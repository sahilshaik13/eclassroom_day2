import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser, UserRole } from '@/types'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  _hasHydrated: boolean

  loginTimestamp: number | null

  setSession: (user: AuthUser, accessToken: string, refreshToken: string) => void
  storeTokenOnly: (user: AuthUser, accessToken: string, refreshToken: string) => void
  updateTokens: (accessToken: string, refreshToken: string) => void
  clearSession: () => void
  hasRole: (role: UserRole) => boolean
  setHasHydrated: (v: boolean) => void
  getRoleExpirationMs: () => number
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      _hasHydrated: false,

      loginTimestamp: null,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setSession: (user, accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('refresh_token', refreshToken)
        set({ user, accessToken, refreshToken, isAuthenticated: true, loginTimestamp: Date.now() })
      },

      // Store token for API calls but don't mark as authenticated
      // Used during MFA flow — axios can send the Bearer token,
      // but route guards won't redirect to the admin portal yet.
      storeTokenOnly: (user, accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('refresh_token', refreshToken)
        set({ user, accessToken, refreshToken, isAuthenticated: false, loginTimestamp: Date.now() })
      },

      updateTokens: (accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('refresh_token', refreshToken)
        set({ accessToken, refreshToken })
      },

      clearSession: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, loginTimestamp: null })
      },

      hasRole: (role) => get().user?.role === role,
      
      getRoleExpirationMs: () => {
        const role = get().user?.role
        if (role === 'admin') return 8 * 60 * 60 * 1000 // 8 hours
        return 30 * 24 * 60 * 60 * 1000 // 30 days
      },
    }),
    {
      name: 'eclassroom-auth',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        isAuthenticated: s.isAuthenticated,
        loginTimestamp: s.loginTimestamp,
      }),
      onRehydrateStorage: () => (state) => {
        // Called once localStorage state has been loaded into the store
        state?.setHasHydrated(true)
      },
    }
  )
)
