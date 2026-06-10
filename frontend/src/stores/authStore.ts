import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser, UserRole } from '@/types'
import { syncSupabaseRealtimeAuth } from '@/lib/supabaseAuth'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  _hasHydrated: boolean

  lastActivityTimestamp: number | null

  setSession: (user: AuthUser, accessToken: string, refreshToken: string) => void
  updateTokens: (accessToken: string, refreshToken: string) => void
  touchActivity: () => void
  clearSession: () => void
  hasRole: (role: UserRole) => boolean
  setHasHydrated: (v: boolean) => void
  getInactivityLimitMs: () => number
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      _hasHydrated: false,

      lastActivityTimestamp: null,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setSession: (user, accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('refresh_token', refreshToken)
        set({ 
          user, 
          accessToken, 
          refreshToken, 
          isAuthenticated: true, 
          lastActivityTimestamp: Date.now() 
        })
        void syncSupabaseRealtimeAuth()
      },

      updateTokens: (accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('refresh_token', refreshToken)
        set({ accessToken, refreshToken, lastActivityTimestamp: Date.now() })
        void syncSupabaseRealtimeAuth()
      },

      touchActivity: () => {
        if (get().isAuthenticated) {
          set({ lastActivityTimestamp: Date.now() })
        }
      },

      clearSession: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, lastActivityTimestamp: null })
      },

      hasRole: (role) => get().user?.role === role,
      
      getInactivityLimitMs: () => {
        const role = get().user?.role
        // Admin: 2 hours of inactivity
        if (role === 'admin') return 2 * 60 * 60 * 1000 
        // Teachers/Students: 4 hours of inactivity
        return 4 * 60 * 60 * 1000
      },
    }),
    {
      name: 'eclassroom-auth',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        isAuthenticated: s.isAuthenticated,
        lastActivityTimestamp: s.lastActivityTimestamp,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
