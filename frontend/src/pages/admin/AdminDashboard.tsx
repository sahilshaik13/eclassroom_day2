import { useEffect, useState } from 'react'
import { Users, GraduationCap, BookOpen, TrendingUp, MessageCircle, CalendarCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { AdminStats } from '@/types'

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/stats')
      .then(r => setStats(r.data.data))
      .catch(() => toast.error('Could not load stats'))
      .finally(() => setLoading(false))
  }, [])

  const kpis = stats ? [
    { label: 'Total Students', value: stats.total_students, icon: GraduationCap, color: 'bg-blue-50 text-blue-600' },
    { label: 'Active Classes', value: stats.total_classes, icon: BookOpen, color: 'bg-violet-50 text-violet-600' },
    { label: 'Teachers', value: stats.total_teachers, icon: Users, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Avg Attendance', value: `${stats.avg_attendance_pct}%`, icon: CalendarCheck, color: 'bg-gold/10 text-gold' },
    { label: 'Task Completion', value: `${stats.avg_task_completion_pct}%`, icon: TrendingUp, color: 'bg-gold/10 text-gold' },
    { label: 'Pending Doubts', value: stats.active_doubts, icon: MessageCircle, color: stats.active_doubts > 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600' },
  ] : []

  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-7">
        <h1 className="font-display text-xl text-ink">
          Admin Dashboard
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Center overview · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {kpis.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card flex items-start gap-4">
              <div className={`stat-icon ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-ink-muted font-medium leading-tight">{label}</p>
                <p className="font-display text-2xl font-semibold text-ink mt-0.5">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 card border-dashed">
        <p className="text-sm font-semibold text-ink mb-1">Quick Actions</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {[
            ['Add Student', '/admin/students'],
            ['Invite Teacher', '/admin/teachers'],
            ['Create Class', '/admin/classes'],
            ['New Study Plan', '/admin/study-plans'],
          ].map(([label, href]) => (
            <a key={href} href={href} className="btn-secondary text-xs py-1.5 px-3">{label}</a>
          ))}
        </div>
      </div>
    </div>
  )
}