import { useState } from 'react'
import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  BookOpen, LayoutDashboard, GraduationCap, MessageCircle,
  Users, Library, Settings, LogOut, Menu, X, Bell, Building2,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/services/authApi'
import type { UserRole } from '@/types'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  student: [
    { label: 'Home', href: '/student', icon: LayoutDashboard },
    { label: 'Classes', href: '/student/classes', icon: GraduationCap },
    { label: 'Ask Teacher', href: '/student/doubts', icon: MessageCircle },
    { label: 'Profile', href: '/student/profile', icon: Settings },
  ],
  teacher: [
    { label: 'Home', href: '/teacher', icon: LayoutDashboard },
    { label: 'Study Plan', href: '/teacher/study-plan', icon: BookOpen },
    { label: 'Students', href: '/teacher/students', icon: Users },
    { label: 'New Applicants', href: '/teacher/applicants', icon: GraduationCap },
    { label: 'Profile', href: '/teacher/profile', icon: Settings },
  ],
  admin: [
    { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { label: 'Students', href: '/admin/students', icon: GraduationCap },
    { label: 'Teachers', href: '/admin/teachers', icon: Users },
    { label: 'Classes', href: '/admin/classes', icon: Library },
    { label: 'Study Plans', href: '/admin/study-plans', icon: BookOpen },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ],
  super_admin: [
    { label: 'Dashboard', href: '/super-admin', icon: LayoutDashboard },
    { label: 'Tenants', href: '/super-admin/tenants', icon: Building2 },
  ],
}

const ROLE_LABEL: Record<UserRole, string> = {
  student: 'Student Portal',
  teacher: "Teacher's Portal",
  admin: 'Admin Portal',
  super_admin: 'Platform Admin',
}

// Only show these in the mobile bottom bar (max 5 items)
const BOTTOM_NAV_ITEMS: Record<UserRole, NavItem[]> = {
  student: [
    { label: 'Home', href: '/student', icon: LayoutDashboard },
    { label: 'Classes', href: '/student/classes', icon: GraduationCap },
    { label: 'Ask Teacher', href: '/student/doubts', icon: MessageCircle },
    { label: 'Profile', href: '/student/profile', icon: Settings },
  ],
  teacher: [
    { label: 'Home', href: '/teacher', icon: LayoutDashboard },
    { label: 'Plan', href: '/teacher/study-plan', icon: BookOpen },
    { label: 'Students', href: '/teacher/students', icon: Users },
    { label: 'Profile', href: '/teacher/profile', icon: Settings },
  ],
  admin: [
    { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { label: 'Students', href: '/admin/students', icon: GraduationCap },
    { label: 'Teachers', href: '/admin/teachers', icon: Users },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ],
  super_admin: [
    { label: 'Dashboard', href: '/super-admin', icon: LayoutDashboard },
    { label: 'Tenants', href: '/super-admin/tenants', icon: Building2 },
  ],
}

export default function PortalLayout() {
  const { user, clearSession } = useAuthStore()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!user) return null
  const role = user.role as UserRole
  const navItems = NAV_ITEMS[role]
  const bottomNavItems = BOTTOM_NAV_ITEMS[role]

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    clearSession()
    toast.success('Logged out')
    navigate(role === 'student' ? '/auth/student-login' : '/auth/login')
  }

  // Logo block
  const LogoBlock = () => (
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
          {ROLE_LABEL[role]}
        </p>
      </div>
    </div>
  )

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-6 pt-8 pb-8 border-b border-slate-50">
        <LogoBlock />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-6 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === `/${role}`}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={clsx('w-5 h-5 shrink-0', isActive ? 'text-blue-600' : 'text-slate-400')}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span>{item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Level badge for student */}
      {role === 'student' && (
        <div className="px-4 pb-2">
          <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="text-xs font-bold text-indigo-700">Level 3: Advanced</span>
            </div>
            <div className="w-full bg-indigo-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full w-[70%] rounded-full transition-all duration-700" />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 pb-6 pt-2 border-t border-slate-50">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all w-full"
        >
          <LogOut className="w-5 h-5 shrink-0" strokeWidth={2} />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-slate-200 shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        </div>
      )}
      <aside
        className={clsx(
          'fixed left-0 top-0 bottom-0 z-50 w-56 bg-white border-r border-slate-200',
          'transform transition-transform duration-250 ease-out md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile only) */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0 shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-slate-500 hover:text-slate-900 p-1"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#4E7DFF] flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-black text-slate-900">E-classroom</span>
          </div>
          <button className="text-slate-500 hover:text-slate-900 p-1">
            <Bell className="w-5 h-5" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="max-w-6xl mx-auto px-4 py-6 md:px-8">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex justify-around items-center h-16 px-2 safe-bottom">
            {bottomNavItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === `/${role}`}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center justify-center w-full h-full gap-1 transition-colors duration-200',
                    isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                    <span className="text-[10px] font-semibold">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
