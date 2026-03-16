import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser, UserRole } from '@/types'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  _hasHydrated: boolean

  setSession: (user: AuthUser, accessToken: string, refreshToken: string) => void
  storeTokenOnly: (user: AuthUser, accessToken: string, refreshToken: string) => void
  updateToken: (accessToken: string) => void
  clearSession: () => void
  hasRole: (role: UserRole) => boolean
  setHasHydrated: (v: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      _hasHydrated: false,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setSession: (user, accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('refresh_token', refreshToken)
        set({ user, accessToken, refreshToken, isAuthenticated: true })
      },

      // Store token for API calls but don't mark as authenticated
      // Used during MFA flow — axios can send the Bearer token,
      // but route guards won't redirect to the admin portal yet.
      storeTokenOnly: (user, accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('refresh_token', refreshToken)
        set({ user, accessToken, refreshToken, isAuthenticated: false })
      },

      updateToken: (accessToken) => {
        localStorage.setItem('access_token', accessToken)
        set({ accessToken })
      },

      clearSession: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },

      hasRole: (role) => get().user?.role === role,
    }),
    {
      name: 'eclassroom-auth',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        isAuthenticated: s.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Called once localStorage state has been loaded into the store
        state?.setHasHydrated(true)
      },
    }
  )
)
