import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import type { UserRole } from '@/types'

interface Props {
  children: React.ReactNode
  role: UserRole
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

  // Wait for persisted state to load before making any auth decisions
  if (!_hasHydrated) return null

  if (!isAuthenticated || !user) {
    const loginPath = role === 'student' ? '/auth/student-login' : '/auth/login'
    return <Navigate to={redirectTo ?? loginPath} state={{ from: location }} replace />
  }

  if (user.role !== role) {
    const portalMap: Record<UserRole, string> = {
      student: '/student',
      teacher: '/teacher',
      admin: '/admin',
      super_admin: '/super-admin',
    }
    return <Navigate to={portalMap[user.role]} replace />
  }

  // Redirect unregistered teachers/students to their registration form
  const isRegistrationPath = location.pathname.includes('-registration')
  if (!isRegistrationPath && user.is_registered === false && role !== 'admin') {
    const regPath = role === 'student'
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
    }
    return <Navigate to={portalMap[user.role]} replace />
  }

  return <>{children}</>
}
