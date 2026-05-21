import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { bootstrapAuthSession } from '@/lib/authSession'
import { useAuthStore } from '@/stores/authStore'
import type { UserRole } from '@/types'

interface Props {
  children: React.ReactNode
  role: UserRole | UserRole[]
  redirectTo?: string
}

/**
 * Wraps a route and redirects if:
 *  - user is not authenticated  → /auth/login (or /auth/student-login)
 *  - user is authenticated but wrong role → their correct portal
 *
 * Returns null while Zustand is rehydrating from localStorage to prevent
 * a false redirect to login on page refresh.
 */
export function RequireRole({ children, role, redirectTo }: Props) {
  const { isAuthenticated, user, _hasHydrated } = useAuthStore()
  const location = useLocation()
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    if (!_hasHydrated) return
    if (!isAuthenticated) {
      setSessionReady(true)
      return
    }
    let cancelled = false
    const timeout = window.setTimeout(() => {
      if (!cancelled) setSessionReady(true)
    }, 8000)
    bootstrapAuthSession().finally(() => {
      if (!cancelled) setSessionReady(true)
    })
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasHydrated, isAuthenticated])

  if (!_hasHydrated) return null
  if (isAuthenticated && !sessionReady) return null

  if (!isAuthenticated || !user) {
    const isStudentRoute = Array.isArray(role) ? role.includes('student') : role === 'student'
    const loginPath = isStudentRoute ? '/auth/student-login' : '/auth/login'
    return <Navigate to={redirectTo ?? loginPath} state={{ from: location }} replace />
  }

  const allowedRoles = Array.isArray(role) ? role : [role]
  if (!allowedRoles.includes(user.role)) {
    const portalMap: Record<UserRole, string> = {
      student: '/student',
      teacher: '/teacher',
      admin: '/admin',
      super_admin: '/super-admin',
      platform_admin: '/super-admin',
    }
    return <Navigate to={portalMap[user.role] || '/auth/login'} replace />
  }

  // Redirect unregistered teachers/students to their registration form
  const isRegistrationPath = location.pathname.includes('-registration')
  const isCompetitionPortal = location.pathname.includes('/competition-portal')
  
  const requiresReg = Array.isArray(role) ? role.includes('student') || role.includes('teacher') : role === 'student' || role === 'teacher'

  if (!isRegistrationPath && !isCompetitionPortal && user.is_registered === false && requiresReg) {
    const regPath = user.role === 'student'
      ? '/auth/student-registration'
      : '/auth/teacher-registration'
    return <Navigate to={regPath} replace />
  }

  return <>{children}</>
}

/** Redirect already-authenticated users away from login pages */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, _hasHydrated } = useAuthStore()

  // Wait for persisted state to load before making any auth decisions
  if (!_hasHydrated) return null

  if (isAuthenticated && user) {
    const portalMap: Record<UserRole, string> = {
      student: '/student',
      teacher: '/teacher',
      admin: '/admin',
      super_admin: '/super-admin',
      platform_admin: '/super-admin',
    }
    return <Navigate to={portalMap[user.role] || '/auth/login'} replace />
  }

  return <>{children}</>
}
