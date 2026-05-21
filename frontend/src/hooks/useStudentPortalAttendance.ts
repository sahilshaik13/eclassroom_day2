import { useEffect, useRef } from 'react'
import api from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

const STORAGE_KEY = 'student-portal-attendance-in'
/** Minimum gap between duplicate IN pings from React strict-mode double mount. */
const MIN_IN_INTERVAL_MS = 3_000

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080') + '/api/v1'

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function getAccessToken(): string | null {
  const fromStore = useAuthStore.getState().accessToken
  if (fromStore) return fromStore
  return localStorage.getItem('access_token')
}

function shouldPingIn(): boolean {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return true
    const parsed = JSON.parse(raw) as { at?: number; date?: string }
    if (parsed.date !== todayKey()) return true
    const last = parsed.at ?? 0
    return !Number.isFinite(last) || Date.now() - last >= MIN_IN_INTERVAL_MS
  } catch {
    return true
  }
}

function markInPinged() {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ at: Date.now(), date: todayKey() }),
    )
  } catch {
    /* ignore */
  }
}

/** Call after student login so attendance is recorded even before layout mounts. */
export async function pingStudentPortalIn(force = false) {
  if (!force && !shouldPingIn()) return
  const token = getAccessToken()
  if (!token) return
  try {
    await api.post('/student/portal-access', { event: 'in' })
    markInPinged()
  } catch (err) {
    console.warn('[attendance] portal IN failed', err)
  }
}

export function recordStudentPortalOut() {
  recordPortalEvent('out')
}

async function recordPortalEvent(event: 'in' | 'out') {
  const token = getAccessToken()
  if (!token) return

  const url = `${BASE_URL}/student/portal-access`
  const body = JSON.stringify({ event })

  if (event === 'out') {
    try {
      fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
      })
    } catch {
      /* tab may already be closing */
    }
    return
  }

  if (!shouldPingIn()) return
  try {
    await api.post('/student/portal-access', { event: 'in' })
    markInPinged()
  } catch (err) {
    console.warn('[attendance] portal IN failed', err)
  }
}

/**
 * IN when the student opens the portal (new window/tab load).
 * OUT when the browser window/tab is closed (pagehide).
 */
export function useStudentPortalAttendance(enabled: boolean) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const outSentRef = useRef(false)

  useEffect(() => {
    if (!enabled || !hasHydrated || !isAuthenticated) return

    outSentRef.current = false
    void recordPortalEvent('in')

    const onPageHide = () => {
      if (outSentRef.current) return
      outSentRef.current = true
      recordPortalEvent('out')
    }

    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [enabled, hasHydrated, isAuthenticated])
}
