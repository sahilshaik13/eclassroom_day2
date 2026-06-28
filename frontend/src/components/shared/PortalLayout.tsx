import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useMediaQuery } from 'react-responsive'
import { useTranslation } from 'react-i18next'
import {
  BookOpen, LayoutDashboard, GraduationCap, MessageCircle, UserCircle,
  Users, Library, Settings, LogOut, Menu, X, Bell, Building2, Trophy, FileText,
  Shield,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useStudyPlanSyncStore } from '@/stores/studyPlanSyncStore'
import { confirmLeaveStudyPlan } from '@/lib/studyPlanLeaveGuard'
import { useStudentPortalAttendance, recordStudentPortalOut } from '@/hooks/useStudentPortalAttendance'
import { StudyPlanUnsyncedDialog } from '@/components/teacher/StudyPlanUnsyncedDialog'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { authApi } from '@/services/authApi'
import type { UserRole } from '@/types'

interface NavItem {
  labelKey?: string
  label?: string
  href: string
  icon: React.ElementType
}

const navLabel = (item: NavItem, t: (key: string) => string) =>
  item.labelKey ? t(item.labelKey) : (item.label ?? '')

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  student: [
    { labelKey: 'nav.dashboard', href: '/student', icon: LayoutDashboard },
    { labelKey: 'nav.progressReport', href: '/student/report', icon: FileText },
    { labelKey: 'nav.myClasses', href: '/student/classes', icon: BookOpen },
    { labelKey: 'nav.competitions', href: '/student/competitions', icon: Trophy },
    { labelKey: 'nav.doubts', href: '/student/doubts', icon: MessageCircle },
    { labelKey: 'nav.myProfile', href: '/student/profile', icon: UserCircle },
  ],
  teacher: [
    { labelKey: 'nav.home', href: '/teacher', icon: LayoutDashboard },
    { labelKey: 'nav.studyPlan', href: '/teacher/study-plan', icon: BookOpen },
    { labelKey: 'nav.students', href: '/teacher/students', icon: Users },
    { labelKey: 'nav.competitions', href: '/teacher/competitions', icon: Trophy },
    { labelKey: 'nav.profile', href: '/teacher/profile', icon: Settings },
  ],
  admin: [
    { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { label: 'Students', href: '/admin/students', icon: GraduationCap },
    { label: 'Teachers', href: '/admin/teachers', icon: Users },
    { label: 'New Applicants', href: '/admin/applicants', icon: GraduationCap },
    { label: 'Classes', href: '/admin/classes', icon: Library },
    { label: 'Competitions', href: '/admin/competitions', icon: Trophy },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ],
  super_admin: [
    { label: 'Dashboard', href: '/super-admin', icon: LayoutDashboard },
    { label: 'Tenants', href: '/super-admin/tenants', icon: Building2 },
    { label: 'API Gateway', href: '/super-admin/gateway', icon: Shield },
  ],
  platform_admin: [
    { label: 'Dashboard', href: '/super-admin', icon: LayoutDashboard },
    { label: 'Tenants', href: '/super-admin/tenants', icon: Building2 },
    { label: 'API Gateway', href: '/super-admin/gateway', icon: Shield },
  ],
}

const ROLE_LABEL_KEY: Record<UserRole, string> = {
  student: 'nav.studentPortal',
  teacher: 'nav.teacherPortal',
  admin: 'nav.dashboard',
  super_admin: 'nav.dashboard',
  platform_admin: 'nav.dashboard',
}

const BOTTOM_NAV_ITEMS: Record<UserRole, NavItem[]> = {
  student: [
    { labelKey: 'nav.home', href: '/student', icon: LayoutDashboard },
    { labelKey: 'nav.report', href: '/student/report', icon: FileText },
    { labelKey: 'nav.classes', href: '/student/classes', icon: BookOpen },
    { labelKey: 'nav.doubts', href: '/student/doubts', icon: MessageCircle },
    { labelKey: 'nav.profile', href: '/student/profile', icon: UserCircle },
  ],
  teacher: [
    { labelKey: 'nav.home', href: '/teacher', icon: LayoutDashboard },
    { labelKey: 'nav.plan', href: '/teacher/study-plan', icon: BookOpen },
    { labelKey: 'nav.students', href: '/teacher/students', icon: Users },
    { labelKey: 'nav.profile', href: '/teacher/profile', icon: Settings },
  ],
  admin: [
    { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { label: 'Students', href: '/admin/students', icon: GraduationCap },
    { label: 'Applicants', href: '/admin/applicants', icon: Users },
    { label: 'Teachers', href: '/admin/teachers', icon: Users },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ],
  super_admin: [
    { label: 'Dashboard', href: '/super-admin', icon: LayoutDashboard },
    { label: 'Tenants', href: '/super-admin/tenants', icon: Building2 },
    { label: 'Gateway', href: '/super-admin/gateway', icon: Shield },
  ],
  platform_admin: [
    { label: 'Dashboard', href: '/super-admin', icon: LayoutDashboard },
    { label: 'Tenants', href: '/super-admin/tenants', icon: Building2 },
    { label: 'Gateway', href: '/super-admin/gateway', icon: Shield },
  ],
}

const LogoBlock = ({ role }: { role: UserRole }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white shadow-lg border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
        <div className="grid grid-cols-2 gap-1 p-2.5">
          <div className="w-2.5 h-2.5 bg-[#4E7DFF] rounded-sm" />
          <div className="w-2.5 h-2.5 bg-[#20C997] rounded-sm" />
          <div className="w-2.5 h-2.5 bg-[#FF922B] rounded-sm" />
          <div className="w-2.5 h-2.5 bg-[#A855F7] rounded-sm" />
        </div>
      </div>
      <div>
        <p className="text-lg font-black text-slate-900 leading-tight tracking-tight">E-classroom</p>
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400 mt-0.5">
          {t(ROLE_LABEL_KEY[role])}
        </p>
      </div>
    </div>
  )
}

const SidebarContent = ({
  role,
  navItems,
  onNavItemClick,
  onLogout,
  currentPath,
  showLanguageSwitcher,
}: {
  role: UserRole
  navItems: NavItem[]
  onNavItemClick: () => void
  onLogout: () => void
  currentPath: string
  showLanguageSwitcher: boolean
}) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-8 pb-8 border-b border-slate-50">
        <LogoBlock role={role} />
      </div>

      <nav className="flex-1 px-3 py-6 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === `/${role}`}
            onClick={async (e) => {
              if (role === 'teacher') {
                const allowed = await confirmLeaveStudyPlan(currentPath, item.href)
                if (!allowed) {
                  e.preventDefault()
                  return
                }
              }
              onNavItemClick()
            }}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={clsx('w-5 h-5 shrink-0', isActive ? 'text-blue-600' : 'text-slate-400')}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span>{navLabel(item, t)}</span>
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {role === 'student' && (
        <div className="px-4 pb-2">
          <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="text-xs font-bold text-indigo-700">{t('nav.levelAdvanced')}</span>
            </div>
            <div className="w-full bg-indigo-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full w-[70%] rounded-full transition-all duration-700" />
            </div>
          </div>
        </div>
      )}

      <div className="px-3 pb-6 pt-2 border-t border-slate-50 space-y-1">
        {showLanguageSwitcher ? <LanguageSwitcher variant="sidebar" /> : null}
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all w-full"
        >
          <LogOut className="w-5 h-5 shrink-0" strokeWidth={2} />
          {t('nav.signOut')}
        </button>
      </div>
    </div>
  )
}

export default function PortalLayout() {
  const { user, clearSession } = useAuthStore()
  const { t } = useTranslation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isDesktop = useMediaQuery({ minWidth: 768 })

  useStudentPortalAttendance(user?.role === 'student' && isAuthenticated)

  useEffect(() => {
    if (isDesktop && mobileOpen) {
      setMobileOpen(false)
    }
  }, [isDesktop, mobileOpen])

  if (!user) return null
  const role = user.role as UserRole
  const navItems = NAV_ITEMS[role]
  const bottomNavItems = BOTTOM_NAV_ITEMS[role]
  const showLanguageSwitcher = role === 'student' || role === 'teacher'

  const handleLogout = async () => {
    if (role === 'teacher') {
      const loginPath = '/auth/login'
      const allowed = await confirmLeaveStudyPlan(location.pathname, loginPath)
      if (!allowed) return
    }
    if (role === 'student') {
      recordStudentPortalOut()
    }
    try {
      await authApi.logout()
    } catch {
      /* ignore */
    }
    clearSession()
    useStudyPlanSyncStore.getState().resetOnPlanLoad()
    toast.success(t('nav.loggedOut'))
    navigate(role === 'student' ? '/auth/student-login' : '/auth/login')
  }

  return (
    <>
      <StudyPlanUnsyncedDialog />
      <div className="app-shell flex h-dvh min-h-screen bg-slate-50 overflow-hidden relative">
        <aside className="hidden md:flex flex-col w-56 lg:w-60 bg-white border-r border-slate-200 shrink-0 relative z-10">
          <SidebarContent
            role={role}
            navItems={navItems}
            onNavItemClick={() => {}}
            onLogout={handleLogout}
            currentPath={location.pathname}
            showLanguageSwitcher={showLanguageSwitcher}
          />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-[60] md:hidden" onClick={() => setMobileOpen(false)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          </div>
        )}
        <aside
          className={clsx(
            'fixed left-0 top-0 bottom-0 z-[70] w-[86vw] max-w-72 bg-white border-r border-slate-200',
            'transform transition-transform duration-250 ease-out md:hidden',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute top-4 right-4 z-10 text-slate-400 hover:text-slate-700 p-2"
          >
            <X className="w-5 h-5" />
          </button>
          <SidebarContent
            role={role}
            navItems={navItems}
            onNavItemClick={() => setMobileOpen(false)}
            onLogout={handleLogout}
            currentPath={location.pathname}
            showLanguageSwitcher={showLanguageSwitcher}
          />
        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="md:hidden flex items-center justify-between px-3.5 py-2.5 bg-white border-b border-slate-200 shrink-0 shadow-sm">
            <button
              onClick={() => setMobileOpen(true)}
              className="text-slate-500 hover:text-slate-900 p-1"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden min-w-0 items-center gap-2 md:flex">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#4E7DFF]">
                <BookOpen className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="truncate text-sm font-black text-slate-900">E-classroom</span>
            </div>
            <div className="flex items-center gap-1">
              {showLanguageSwitcher ? <LanguageSwitcher variant="header" /> : null}
              <button className="text-slate-500 hover:text-slate-900 p-1">
                <Bell className="w-5 h-5" />
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto overflow-x-clip pb-20 md:pb-0">
            <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5 lg:px-8">
              <Outlet />
            </div>
          </main>

          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="flex justify-around items-center h-16 px-2 safe-bottom">
              {bottomNavItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.href === `/${role}`}
                  onClick={async (e) => {
                    if (role === 'teacher') {
                      const allowed = await confirmLeaveStudyPlan(location.pathname, item.href)
                      if (!allowed) {
                        e.preventDefault()
                        return
                      }
                    }
                  }}
                  className={({ isActive }) =>
                    clsx(
                      'flex flex-col items-center justify-center w-full h-full gap-1 transition-colors duration-200',
                      isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                      <span className="text-[10px] font-semibold">{navLabel(item, t)}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </>
  )
}
