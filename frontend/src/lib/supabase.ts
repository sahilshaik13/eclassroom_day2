import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

/** True when env points at the default local Supabase stack (not running in this project). */
export function isLocalSupabaseEnv(): boolean {
  if (!supabaseUrl || !supabaseAnonKey) return true
  if (/127\.0\.0\.1|localhost/i.test(supabaseUrl)) return true
  if (supabaseAnonKey.includes('supabase-demo')) return true
  return false
}

/** Cloud Supabase URL + anon key present and not localhost demo. */
export const supabaseRealtimeEnabled =
  import.meta.env.VITE_USE_REALTIME === 'true' && !isLocalSupabaseEnv()

if (import.meta.env.DEV) {
  if (isLocalSupabaseEnv()) {
    console.warn(
      '[Supabase] Realtime disabled: frontend/.env must set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
        'to your cloud project (copy from backend/.env). Restart `npm run dev` after changing .env.',
    )
  } else {
    console.info('[Supabase] Realtime target:', supabaseUrl)
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing in environment variables.')
}

/**
 * Supabase client for Realtime only. Auth/session is handled by FastAPI + Zustand;
 * do not persist GoTrue sessions (avoids /auth/v1/user calls to a stale local URL).
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
)
