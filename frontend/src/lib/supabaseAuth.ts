import { supabase, supabaseRealtimeEnabled } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

/**
 * Attach the portal JWT to Supabase Realtime (postgres_changes RLS).
 * Uses realtime.setAuth only — never auth.setSession (that calls /auth/v1/user).
 */
export async function syncSupabaseRealtimeAuth(): Promise<void> {
  if (!supabaseRealtimeEnabled) return

  const { accessToken, isAuthenticated } = useAuthStore.getState()
  if (!isAuthenticated) return

  const token =
    accessToken ?? localStorage.getItem('access_token') ?? undefined
  if (!token) return

  try {
    await supabase.realtime.setAuth(token)
  } catch {
    /* Realtime stays on anon if sync fails */
  }
}
