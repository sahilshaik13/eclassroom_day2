import { useState } from 'react'
import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  BookOpen, LayoutDashboard, GraduationCap, MessageCircle,
  CalendarCheck, Star, FileText, Users, Library, Settings,
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
    { label: 'Dashboard',   href: '/teacher',             icon: LayoutDashboard },
    { label: 'Students',    href: '/teacher/students',    icon: Users },
    { label: 'Attendance',  href: '/teacher/attendance',  icon: CalendarCheck },
    { label: 'Doubts',      href: '/teacher/doubts',      icon: MessageCircle },
    { label: 'Grades',      href: '/teacher/grades',      icon: Star },
    { label: 'Reports',     href: '/teacher/reports',     icon: FileText },
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
  teacher: 'text-emerald-400',
  admin:   'text-violet-400',
}

const ROLE_LABEL: Record<UserRole, string> = {
  student: 'Student Portal',
  teacher: 'Teacher Portal',
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
      <div className="px-5 pt-6 pb-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-gold" />
          </div>
          <div>
            <p className="text-xs font-semibold text-ink leading-none">ThinkTarteeb</p>
            <p className={clsx('text-[10px] font-medium mt-0.5', ROLE_ACCENT[role])}>
              {ROLE_LABEL[role]}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === `/${role}`}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              clsx('nav-link', isActive && 'active')
            }
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-border">
        <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-gold">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink truncate">{user.name}</p>
            <p className="text-[10px] text-ink-faint capitalize">{user.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="nav-link w-full text-left text-red-400 hover:bg-red-50 hover:text-red-500"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Logout
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
            <BookOpen className="w-4 h-4 text-gold" />
            <span className="font-display text-sm font-semibold text-ink">ThinkTarteeb</span>
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
