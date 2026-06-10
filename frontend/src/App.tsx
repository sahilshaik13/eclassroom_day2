import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Suspense, lazy, useEffect } from 'react'

// Store
import { useAuthStore } from '@/stores/authStore'

// Auth guards
import { RequireRole, RedirectIfAuthed } from '@/components/shared/RouteGuards'

// Layout
import PortalLayout from '@/components/shared/PortalLayout'

// Auth pages (eager — first paint)
import StudentLoginPage from '@/pages/auth/StudentLoginPage'
import StaffLoginPage from '@/pages/auth/StaffLoginPage'
import AuthCallback from '@/pages/auth/AuthCallback'
import SetupPasswordPage from '@/pages/auth/SetupPasswordPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import StudentRegistrationPage from '@/pages/auth/StudentRegistrationPage'
import TeacherRegistrationPage from '@/pages/auth/TeacherRegistrationPage'

// Public apply (small)
import TeacherApplyPage from './pages/public/TeacherApplyPage'
import StudentApplyPage from './pages/public/StudentApplyPage'
import { CompetitionLandingPage } from './pages/public/CompetitionLandingPage'

const PageFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground" role="status" aria-live="polite">
    Loading…
  </div>
)

// Student pages
const StudentDashboard = lazy(() => import('@/pages/student/StudentDashboard'))
const StudentClassesPage = lazy(() => import('@/pages/student/StudentClassesPage'))
const StudentDoubtsPage = lazy(() => import('@/pages/student/StudentDoubtsPage'))
const StudentProfilePage = lazy(() => import('@/pages/student/StudentProfilePage'))
const StudentCompetitionsPage = lazy(() => import('@/pages/student/StudentCompetitionsPage'))
const StudentExamPage = lazy(() => import('@/pages/student/StudentExamPage'))
const StudentReportPage = lazy(() => import('@/pages/student/StudentReportPage'))

// Teacher pages
const TeacherDashboard = lazy(() => import('./pages/teacher/TeacherDashboard'))
const TeacherStudentsPage = lazy(() => import('./pages/teacher/TeacherStudentsPage'))
const AttendancePage = lazy(() => import('./pages/teacher/AttendancePage'))
const TeacherDoubtsPage = lazy(() => import('./pages/teacher/TeacherDoubtsPage'))
const GradesPage = lazy(() => import('./pages/teacher/GradesPage'))
const ReportsPage = lazy(() => import('./pages/teacher/ReportsPage'))
const TeacherProfilePage = lazy(() => import('./pages/teacher/TeacherProfilePage'))
const TeacherStudyPlanPage = lazy(() => import('./pages/teacher/TeacherStudyPlanPage'))
const TeacherEvaluationPage = lazy(() => import('./pages/teacher/TeacherEvaluationPage'))
const TeacherCompetitionsPage = lazy(() => import('./pages/teacher/TeacherCompetitionsPage'))
const TeacherExamSetupPage = lazy(() => import('./pages/teacher/TeacherExamSetupPage'))
const TeacherParticipantPortal = lazy(() => import('./pages/teacher/TeacherParticipantPortal'))

// Competition portal
const CompetitionPortalPage = lazy(() =>
  import('./pages/competition/CompetitionPortalPage').then((m) => ({
    default: m.CompetitionPortalPage,
  }))
)

// Admin pages
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const AdminStudentsPage = lazy(() => import('@/pages/admin/AdminStudentsPage'))
const AdminTeachersPage = lazy(() => import('@/pages/admin/AdminTeachersPage'))
const AdminClassesPage = lazy(() => import('@/pages/admin/AdminClassesPage'))
const AdminSettingsPage = lazy(() => import('@/pages/admin/AdminSettingsPage'))
const AdminCompetitionsPage = lazy(() => import('@/pages/admin/AdminCompetitionsPage'))
const AdminClassStudyPlanPage = lazy(() => import('@/pages/admin/AdminClassStudyPlanPage'))

// Super Admin pages
const SuperAdminDashboard = lazy(() => import('@/pages/superadmin/SuperAdminDashboard'))
const TenantsPage = lazy(() => import('@/pages/superadmin/TenantPage'))
const TenantDetailPage = lazy(() => import('@/pages/superadmin/TenantDetailPage'))
const SuperAdminTenantTeachersPage = lazy(() => import('@/pages/superadmin/SuperAdminTenantTeachersPage'))
const SuperAdminTenantStudentsPage = lazy(() => import('@/pages/superadmin/SuperAdminTenantStudentsPage'))

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>
}

function AuthEventListener() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  useEffect(() => {
    const handleLogout = () => {
      localStorage.removeItem('eclassroom-auth')
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')

      const role = user?.role
      if (role === 'student') {
        navigate('/auth/student-login', { replace: true })
      } else {
        navigate('/auth/login', { replace: true })
      }
    }

    window.addEventListener('eclassroom-logout', handleLogout)
    return () => window.removeEventListener('eclassroom-logout', handleLogout)
  }, [navigate, user?.role])

  return null
}

function HashHandler() {
  const navigate = useNavigate()
  useEffect(() => {
    const hashData = new URLSearchParams(window.location.hash.substring(1))
    const searchData = new URLSearchParams(window.location.search.substring(1))

    const accessToken =
      hashData.get('access_token') ||
      searchData.get('access_token') ||
      searchData.get('token')

    const type = hashData.get('type') || searchData.get('type')

    if (accessToken && type === 'recovery') {
      const suffix =
        window.location.hash ||
        (window.location.search
          ? '#' + window.location.search.substring(1)
          : '')
      navigate('/auth/reset-password' + suffix, { replace: true })
      return
    }

    if (accessToken && type === 'invite') {
      const suffix =
        window.location.hash ||
        (window.location.search
          ? '#' + window.location.search.substring(1)
          : '')
      navigate('/auth/callback' + suffix, { replace: true })
    }
  }, [navigate])
  return null
}

function ActivityTracker() {
  const { touchActivity, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) return

    const handleActivity = () => {
      touchActivity()
    }

    window.addEventListener('mousedown', handleActivity)
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('touchstart', handleActivity)

    return () => {
      window.removeEventListener('mousedown', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
    }
  }, [touchActivity, isAuthenticated])

  return null
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthEventListener />
      <ActivityTracker />
      <HashHandler />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: 'DM Sans, system-ui, sans-serif',
            fontSize: '14px',
            borderRadius: '12px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          },
          success: { iconTheme: { primary: '#C9A84C', secondary: '#fff' } },
        }}
      />

      <Routes>
        <Route path="/" element={<Navigate to="/auth/student-login" replace />} />

        <Route
          path="/auth/student-login"
          element={<RedirectIfAuthed><StudentLoginPage /></RedirectIfAuthed>}
        />
        <Route
          path="/auth/login"
          element={<RedirectIfAuthed><StaffLoginPage /></RedirectIfAuthed>}
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/setup-password" element={<SetupPasswordPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/auth/student-registration"
          element={<RequireRole role="student"><StudentRegistrationPage /></RequireRole>}
        />
        <Route
          path="/auth/teacher-registration"
          element={<RequireRole role="teacher"><TeacherRegistrationPage /></RequireRole>}
        />
        <Route path="/apply/:slug" element={<TeacherApplyPage />} />
        <Route path="/apply/:slug/student" element={<StudentApplyPage />} />
        <Route path="/compete/:competition_id" element={<CompetitionLandingPage />} />

        <Route
          path="/competition-portal"
          element={
            <RequireRole role="student">
              <Lazy><CompetitionPortalPage /></Lazy>
            </RequireRole>
          }
        />

        <Route
          path="/student"
          element={<RequireRole role="student"><PortalLayout /></RequireRole>}
        >
          <Route index element={<Lazy><StudentDashboard /></Lazy>} />
          <Route path="study-plan" element={<Navigate to="/student/classes" replace />} />
          <Route path="classes" element={<Lazy><StudentClassesPage /></Lazy>} />
          <Route path="progress" element={<Navigate to="/student/report" replace />} />
          <Route path="today" element={<Navigate to="/student" replace />} />
          <Route path="doubts" element={<Lazy><StudentDoubtsPage /></Lazy>} />
          <Route path="competitions" element={<Lazy><StudentCompetitionsPage /></Lazy>} />
          <Route path="competitions/:id/exam" element={<Lazy><StudentExamPage /></Lazy>} />
          <Route path="report" element={<Lazy><StudentReportPage /></Lazy>} />
          <Route path="profile" element={<Lazy><StudentProfilePage /></Lazy>} />
        </Route>

        <Route
          path="/teacher"
          element={<RequireRole role="teacher"><PortalLayout /></RequireRole>}
        >
          <Route index element={<Lazy><TeacherDashboard /></Lazy>} />
          <Route path="students" element={<Lazy><TeacherStudentsPage /></Lazy>} />
          <Route path="study-plan" element={<Lazy><TeacherStudyPlanPage /></Lazy>} />
          <Route path="submissions" element={<Navigate to="/teacher" replace />} />
          <Route path="applicants" element={<Navigate to="/teacher" replace />} />
          <Route path="attendance" element={<Lazy><AttendancePage /></Lazy>} />
          <Route path="doubts" element={<Lazy><TeacherDoubtsPage /></Lazy>} />
          <Route path="grades" element={<Lazy><GradesPage /></Lazy>} />
          <Route path="reports" element={<Lazy><ReportsPage /></Lazy>} />
          <Route path="profile" element={<Lazy><TeacherProfilePage /></Lazy>} />
          <Route path="competitions" element={<Lazy><TeacherCompetitionsPage /></Lazy>} />
          <Route path="competitions/:id/setup" element={<Lazy><TeacherExamSetupPage /></Lazy>} />
          <Route
            path="competitions/:competition_id/evaluate/:registration_id"
            element={<Lazy><TeacherParticipantPortal /></Lazy>}
          />
          <Route path="evaluate/:mode/:id" element={<Lazy><TeacherEvaluationPage /></Lazy>} />
          <Route path="evaluate/:mode/:id/:studentId" element={<Lazy><TeacherEvaluationPage /></Lazy>} />
          <Route path="report/:studentId" element={<Lazy><StudentReportPage /></Lazy>} />
        </Route>

        <Route
          path="/admin"
          element={<RequireRole role="admin"><PortalLayout /></RequireRole>}
        >
          <Route index element={<Lazy><AdminDashboard /></Lazy>} />
          <Route path="students" element={<Lazy><AdminStudentsPage /></Lazy>} />
          <Route path="teachers" element={<Lazy><AdminTeachersPage /></Lazy>} />
          <Route path="applicants" element={<Lazy><AdminTeachersPage /></Lazy>} />
          <Route path="classes" element={<Lazy><AdminClassesPage /></Lazy>} />
          <Route path="study-plans" element={<Navigate to="/admin/classes" replace />} />
          <Route path="settings" element={<Lazy><AdminSettingsPage /></Lazy>} />
          <Route path="competitions" element={<Lazy><AdminCompetitionsPage /></Lazy>} />
          <Route path="classes/:classId/study-plan" element={<Lazy><AdminClassStudyPlanPage /></Lazy>} />
        </Route>

        <Route
          path="/super-admin"
          element={<RequireRole role={['super_admin', 'platform_admin']}><PortalLayout /></RequireRole>}
        >
          <Route index element={<Lazy><SuperAdminDashboard /></Lazy>} />
          <Route path="tenants" element={<Lazy><TenantsPage /></Lazy>} />
          <Route path="tenants/:tenantId" element={<Lazy><TenantDetailPage /></Lazy>} />
          <Route path="tenants/:tenantId/teachers" element={<Lazy><SuperAdminTenantTeachersPage /></Lazy>} />
          <Route path="tenants/:tenantId/students" element={<Lazy><SuperAdminTenantStudentsPage /></Lazy>} />
        </Route>

        <Route path="*" element={<Navigate to="/auth/student-login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
