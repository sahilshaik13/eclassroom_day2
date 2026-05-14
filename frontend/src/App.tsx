import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'

// Store
import { useAuthStore } from '@/stores/authStore'

// Auth guards
import { RequireRole, RedirectIfAuthed } from '@/components/shared/RouteGuards'

// Layout
import PortalLayout from '@/components/shared/PortalLayout'

// Auth pages
import StudentLoginPage from '@/pages/auth/StudentLoginPage'
import StaffLoginPage from '@/pages/auth/StaffLoginPage'
import MFASetupPage from '@/pages/auth/MFASetupPage'
import MFAVerifyPage from '@/pages/auth/MFAVerifyPage'
import AuthCallback from '@/pages/auth/AuthCallback'
import SetupPasswordPage from '@/pages/auth/SetupPasswordPage'
import StudentRegistrationPage from '@/pages/auth/StudentRegistrationPage'
import TeacherRegistrationPage from '@/pages/auth/TeacherRegistrationPage'

// Student pages
import StudentDashboard from '@/pages/student/StudentDashboard'
import StudyPlanPage from '@/pages/student/StudyPlanPage'
import StudentClassesPage from '@/pages/student/StudentClassesPage'
import StudentDoubtsPage from '@/pages/student/StudentDoubtsPage'
import StudentProfilePage from '@/pages/student/StudentProfilePage'
import StudentCompetitionsPage from '@/pages/student/StudentCompetitionsPage'
import StudentExamPage from '@/pages/student/StudentExamPage'
import StudentProgressPage from '@/pages/student/StudentProgressPage'
import StudentReportPage from '@/pages/student/StudentReportPage'

// Teacher pages
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import TeacherStudentsPage from './pages/teacher/TeacherStudentsPage'
import AttendancePage from './pages/teacher/AttendancePage'
import TeacherDoubtsPage from './pages/teacher/TeacherDoubtsPage'
import GradesPage from './pages/teacher/GradesPage'
import ReportsPage from './pages/teacher/ReportsPage'
import TeacherProfilePage from './pages/teacher/TeacherProfilePage'
import TeacherStudyPlanPage from './pages/teacher/TeacherStudyPlanPage'
import TeacherEvaluationPage from './pages/teacher/TeacherEvaluationPage'
import TeacherApplyPage from './pages/public/TeacherApplyPage'
import StudentApplyPage from './pages/public/StudentApplyPage'
import TeacherCompetitionsPage from './pages/teacher/TeacherCompetitionsPage'
import TeacherExamSetupPage from './pages/teacher/TeacherExamSetupPage'
import TeacherParticipantPortal from './pages/teacher/TeacherParticipantPortal'

// Competition pages
import { CompetitionLandingPage } from './pages/public/CompetitionLandingPage'
import { CompetitionPortalPage } from './pages/competition/CompetitionPortalPage'

// Admin pages
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminStudentsPage from '@/pages/admin/AdminStudentsPage'
import AdminTeachersPage from '@/pages/admin/AdminTeachersPage'
import AdminClassesPage from '@/pages/admin/AdminClassesPage'
import StudyPlansPage from '@/pages/admin/StudyPlansPage'
import AdminSettingsPage from '@/pages/admin/AdminSettingsPage'
import AdminCompetitionsPage from '@/pages/admin/AdminCompetitionsPage'
import AdminClassStudyPlanPage from '@/pages/admin/AdminClassStudyPlanPage'

// Super Admin pages
import SuperAdminDashboard from '@/pages/superadmin/SuperAdminDashboard'
import TenantsPage from '@/pages/superadmin/TenantPage'
import TenantDetailPage from '@/pages/superadmin/TenantDetailPage'
import SuperAdminTenantTeachersPage from '@/pages/superadmin/SuperAdminTenantTeachersPage'
import SuperAdminTenantStudentsPage from '@/pages/superadmin/SuperAdminTenantStudentsPage'

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

    if (accessToken && type === 'invite') {
      console.log('Detected invite token on root, redirecting to callback...')
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
      // Use a small debounce/throttle implicitly by just calling it
      // Zustand handles the shallow check
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
        {/* ── Root ─────────────────────────── */}
        <Route path="/" element={<Navigate to="/auth/student-login" replace />} />

        {/* ── Auth ───────────────────────────── */}
        <Route
          path="/auth/student-login"
          element={<RedirectIfAuthed><StudentLoginPage /></RedirectIfAuthed>}
        />
        <Route
          path="/auth/login"
          element={<RedirectIfAuthed><StaffLoginPage /></RedirectIfAuthed>}
        />
        <Route path="/auth/mfa-setup" element={<MFASetupPage />} />
        <Route path="/auth/mfa-verify" element={<MFAVerifyPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/setup-password" element={<SetupPasswordPage />} />
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
        
        {/* ── Competition Portal (External Participants) ── */}
        <Route 
          path="/competition-portal" 
          element={<RequireRole role="student"><CompetitionPortalPage /></RequireRole>} 
        />

        {/* ── Student portal ────────────────── */}
        <Route
          path="/student"
          element={<RequireRole role="student"><PortalLayout /></RequireRole>}
        >
          <Route index element={<StudentDashboard />} />
          <Route path="study-plan" element={<StudyPlanPage />} />
          <Route path="classes" element={<StudentClassesPage />} />
          <Route path="progress" element={<StudentProgressPage />} />
          <Route path="today" element={<Navigate to="/student" replace />} />
          <Route path="doubts" element={<StudentDoubtsPage />} />
          <Route path="competitions" element={<StudentCompetitionsPage />} />
          <Route path="competitions/:id/exam" element={<StudentExamPage />} />
          <Route path="report" element={<StudentReportPage />} />
          <Route path="profile" element={<StudentProfilePage />} />
        </Route>

        {/* ── Teacher portal ────────────────── */}
        <Route
          path="/teacher"
          element={<RequireRole role="teacher"><PortalLayout /></RequireRole>}
        >
          <Route index element={<TeacherDashboard />} />
          <Route path="students" element={<TeacherStudentsPage />} />
          <Route path="study-plan" element={<TeacherStudyPlanPage />} />
          <Route path="submissions" element={<Navigate to="/teacher" replace />} />
          <Route path="applicants" element={<Navigate to="/teacher" replace />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="doubts" element={<TeacherDoubtsPage />} />
          <Route path="grades" element={<GradesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="profile" element={<TeacherProfilePage />} />
          <Route path="competitions" element={<TeacherCompetitionsPage />} />
          <Route path="competitions/:id/setup" element={<TeacherExamSetupPage />} />
          <Route path="competitions/:competition_id/evaluate/:registration_id" element={<TeacherParticipantPortal />} />
          <Route path="evaluate/:mode/:id" element={<TeacherEvaluationPage />} />
          <Route path="evaluate/:mode/:id/:studentId" element={<TeacherEvaluationPage />} />
          <Route path="report/:studentId" element={<StudentReportPage />} />
        </Route>

        {/* ── Admin portal ──────────────────── */}
        <Route
          path="/admin"
          element={<RequireRole role="admin"><PortalLayout /></RequireRole>}
        >
          <Route index element={<AdminDashboard />} />
          <Route path="students" element={<AdminStudentsPage />} />
          <Route path="teachers" element={<AdminTeachersPage />} />
          <Route path="applicants" element={<AdminTeachersPage />} />
          <Route path="classes" element={<AdminClassesPage />} />
          <Route path="study-plans" element={<StudyPlansPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="competitions" element={<AdminCompetitionsPage />} />
          <Route path="classes/:classId/study-plan" element={<AdminClassStudyPlanPage />} />
        </Route>

        {/* ── Super Admin portal ──────────────── */}
        <Route
          path="/super-admin"
          element={<RequireRole role={['super_admin', 'platform_admin']}><PortalLayout /></RequireRole>}
        >
          <Route index element={<SuperAdminDashboard />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="tenants/:tenantId" element={<TenantDetailPage />} />
          <Route path="tenants/:tenantId/teachers" element={<SuperAdminTenantTeachersPage />} />
          <Route path="tenants/:tenantId/students" element={<SuperAdminTenantStudentsPage />} />
        </Route>

        {/* ── 404 ───────────────────────────── */}
        <Route path="*" element={<Navigate to="/auth/student-login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}