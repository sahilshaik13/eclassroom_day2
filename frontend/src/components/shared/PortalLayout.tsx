import { useState } from 'react'
import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  BookOpen, LayoutDashboard, GraduationCap, MessageCircle,
  Users, Library, Settings,
  LogOut, Menu, X, Bell,
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
    { label: 'Dashboard',   href: '/student',             icon: LayoutDashboard },
    { label: 'Study Plan',  href: '/student/study-plan',  icon: BookOpen },
    { label: 'My Classes',  href: '/student/classes',     icon: GraduationCap },
    { label: 'Doubts',      href: '/student/doubts',      icon: MessageCircle },
    { label: 'Profile',     href: '/student/profile',     icon: Settings },
  ],
  teacher: [
    { label: 'Home',           href: '/teacher',             icon: LayoutDashboard },
    { label: 'Study Plan',     href: '/teacher/study-plan',  icon: BookOpen },
    { label: 'Students',       href: '/teacher/students',    icon: Users },
    { label: 'New Applicants', href: '/teacher/applicants',  icon: GraduationCap },
    { label: 'Profile',        href: '/teacher/profile',     icon: Settings },
  ],
  admin: [
    { label: 'Dashboard',   href: '/admin',               icon: LayoutDashboard },
    { label: 'Students',    href: '/admin/students',      icon: GraduationCap },
    { label: 'Teachers',    href: '/admin/teachers',      icon: Users },
    { label: 'Classes',     href: '/admin/classes',       icon: Library },
    { label: 'Study Plans', href: '/admin/study-plans',   icon: BookOpen },
    { label: 'Settings',    href: '/admin/settings',      icon: Settings },
  ],
}

const ROLE_ACCENT: Record<UserRole, string> = {
  student: 'text-gold',
  teacher: 'text-slate-400',
  admin:   'text-violet-400',
}

const ROLE_LABEL: Record<UserRole, string> = {
  student: 'Student Portal',
  teacher: "TEACHER'S PORTAL",
  admin:   'Admin Portal',
}

export default function PortalLayout() {
  const { user, clearSession } = useAuthStore()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!user) return null
  const role = user.role as UserRole
  const navItems = NAV_ITEMS[role]

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    clearSession()
    toast.success('Logged out')
    navigate(role === 'student' ? '/auth/student-login' : '/auth/login')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-8 pt-10 pb-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-xl shadow-slate-200/50 border border-slate-50 flex items-center justify-center shrink-0">
             <div className="grid grid-cols-2 gap-1 p-3">
               <div className="w-3 h-3 bg-[#4E7DFF] rounded-sm" />
               <div className="w-3 h-3 bg-[#20C997] rounded-sm" />
               <div className="w-3 h-3 bg-[#FF922B] rounded-sm" />
               <div className="w-3 h-3 bg-[#A855F7] rounded-sm" />
             </div>
          </div>
          <div>
            <p className="text-xl font-black text-slate-900 leading-tight tracking-tight">E-classroom</p>
            <p className={clsx('text-[9px] font-black uppercase tracking-[0.2em] mt-1', ROLE_ACCENT[role])}>
              {ROLE_LABEL[role]}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === `/${role}`}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-300',
                isActive 
                  ? 'bg-[#4E7DFF]/10 text-[#4E7DFF]' 
                  : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
              )
            }
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-8 mt-auto border-t border-slate-50">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all w-full"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-surface-alt overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-border shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        </div>
      )}
      <aside
        className={clsx(
          'fixed left-0 top-0 bottom-0 z-50 w-56 bg-white border-r border-border',
          'transform transition-transform duration-250 ease-out lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-ink-faint hover:text-ink"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-border shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-ink-muted hover:text-ink"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#4E7DFF] flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-display text-sm font-black text-slate-900">E-classroom</span>
          </div>
          <button className="text-ink-muted hover:text-ink relative">
            <Bell className="w-5 h-5" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
