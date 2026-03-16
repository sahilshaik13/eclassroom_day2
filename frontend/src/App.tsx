import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

// Auth guards
import { RequireRole, RedirectIfAuthed } from '@/components/shared/RouteGuards'

// Layout
import PortalLayout from '@/components/shared/PortalLayout'

// Auth pages
import StudentLoginPage from '@/pages/auth/StudentLoginPage'
import StaffLoginPage from '@/pages/auth/StaffLoginPage'
import MFASetupPage from '@/pages/auth/MFASetupPage'
import MFAVerifyPage from '@/pages/auth/MFAVerifyPage'

// Student pages
import StudentDashboard from '@/pages/student/StudentDashboard'
import StudyPlanPage from '@/pages/student/StudyPlanPage'
import StudentClassesPage from '@/pages/student/StudentClassesPage'
import StudentDoubtsPage from '@/pages/student/StudentDoubtsPage'
import StudentProfilePage from '@/pages/student/StudentProfilePage'

// Teacher pages
import TeacherDashboard from '@/pages/teacher/TeacherDashboard'
import TeacherStudentsPage from '@/pages/teacher/TeacherStudentsPage'
import AttendancePage from '@/pages/teacher/AttendancePage'
import TeacherDoubtsPage from '@/pages/teacher/TeacherDoubtsPage'
import GradesPage from '@/pages/teacher/GradesPage'
import ReportsPage from '@/pages/teacher/ReportsPage'

// Admin pages
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminStudentsPage from '@/pages/admin/AdminStudentsPage'
import AdminTeachersPage from '@/pages/admin/AdminTeachersPage'
import AdminClassesPage from '@/pages/admin/AdminClassesPage'
import StudyPlansPage from '@/pages/admin/StudyPlansPage'
import AdminSettingsPage from '@/pages/admin/AdminSettingsPage'

export default function App() {
  return (
    <BrowserRouter>
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
        {/* ── Root redirect ─────────────────────────── */}
        <Route path="/" element={<Navigate to="/auth/login" replace />} />

        {/* ── Auth routes ───────────────────────────── */}
        <Route
          path="/auth/student-login"
          element={
            <RedirectIfAuthed>
              <StudentLoginPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/auth/login"
          element={
            <RedirectIfAuthed>
              <StaffLoginPage />
            </RedirectIfAuthed>
          }
        />
        <Route path="/auth/mfa-setup" element={<MFASetupPage />} />
        <Route path="/auth/mfa-verify" element={<MFAVerifyPage />} />

        {/* ── Student portal ────────────────────────── */}
        <Route
          path="/student"
          element={
            <RequireRole role="student">
              <PortalLayout />
            </RequireRole>
          }
        >
          <Route index element={<StudentDashboard />} />
          <Route path="study-plan" element={<StudyPlanPage />} />
          <Route path="classes" element={<StudentClassesPage />} />
          <Route path="doubts" element={<StudentDoubtsPage />} />
          <Route path="profile" element={<StudentProfilePage />} />
        </Route>

        {/* ── Teacher portal ────────────────────────── */}
        <Route
          path="/teacher"
          element={
            <RequireRole role="teacher">
              <PortalLayout />
            </RequireRole>
          }
        >
          <Route index element={<TeacherDashboard />} />
          <Route path="students" element={<TeacherStudentsPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="doubts" element={<TeacherDoubtsPage />} />
          <Route path="grades" element={<GradesPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>

        {/* ── Admin portal ──────────────────────────── */}
        <Route
          path="/admin"
          element={
            <RequireRole role="admin">
              <PortalLayout />
            </RequireRole>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="students" element={<AdminStudentsPage />} />
          <Route path="teachers" element={<AdminTeachersPage />} />
          <Route path="classes" element={<AdminClassesPage />} />
          <Route path="study-plans" element={<StudyPlansPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>

        {/* ── 404 ───────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}