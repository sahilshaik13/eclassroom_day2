import { useEffect, useState } from 'react'
import { Users, MessageCircle, TrendingUp, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { StudentPulse } from '@/types'

export default function TeacherDashboard() {
  const { user } = useAuthStore()
  const [pulse, setPulse]   = useState<StudentPulse[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true)
    try {
      const res = await api.get('/teacher/pulse/today')
      setPulse(res.data.data)
    } catch { toast.error('Could not load pulse data') }
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { load() }, [])

  const totalStudents = pulse.length
  const avgCompletion = totalStudents
    ? Math.round(pulse.reduce((s, p) => s + p.completion_pct, 0) / totalStudents)
    : 0
  const pendingDoubts = pulse.reduce((s, p) => s + p.pending_doubts, 0)

  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  )

  return (
    <div className="p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl text-ink">
            Assalamu Alaikum, <span className="text-emerald-600">{user?.name.split(' ')[0]}</span>
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="btn-ghost text-xs"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 stagger">
        <StatCard icon={Users} color="bg-emerald-50 text-emerald-600"
          label="Students" value={totalStudents} />
        <StatCard icon={TrendingUp} color="bg-gold/10 text-gold"
          label="Avg Completion" value={`${avgCompletion}%`} />
        <StatCard icon={MessageCircle} color="bg-red-50 text-red-500"
          label="Pending Doubts" value={pendingDoubts}
          alert={pendingDoubts > 0} />
      </div>

      {/* Pulse table */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <h2 className="font-semibold text-sm text-ink">Daily Pulse</h2>
          <span className="text-xs text-ink-faint ml-auto">Today's progress</span>
        </div>

        {pulse.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-8">
            No students enrolled yet.
          </p>
        ) : (
          <div className="space-y-3">
            {pulse.map(s => (
              <div key={s.student_id} className="flex items-center gap-4 p-3 rounded-xl bg-surface-alt">
                <div className="w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-ink-muted">
                    {s.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{s.name}</p>
                  <div className="mt-1.5 progress-bar">
                    <div
                      className={clsx('progress-fill', s.completion_pct === 100 ? 'bg-emerald-500' : 'bg-gold')}
                      style={{ width: `${s.completion_pct}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={clsx('text-sm font-semibold',
                    s.completion_pct === 100 ? 'text-emerald-600' : 'text-ink')}>
                    {s.completion_pct}%
                  </p>
                  {s.pending_doubts > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      {s.pending_doubts} doubt{s.pending_doubts > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, alert }: {
  icon: React.ElementType; label: string; value: string | number
  color: string; alert?: boolean
}) {
  return (
    <div className={clsx('card flex items-center gap-4', alert && 'border-red-100')}>
      <div className={clsx('stat-icon', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-ink-muted font-medium">{label}</p>
        <p className={clsx('font-display text-2xl font-semibold', alert ? 'text-red-500' : 'text-ink')}>
          {value}
        </p>
      </div>
    </div>
  )
}
