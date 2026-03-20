import { useEffect, useState } from 'react'
import {
  Users,
  GraduationCap,
  BookOpen,
  MessageCircle,
  CalendarCheck,
  Download,
  TrendingUp,
  Activity,
  UserPlus,
  BookMarked,
  Settings as SettingsIcon,
  ChevronRight
} from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { AdminStats } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const SPARK_DATA = [
  { day: 'Mon', value: 88 },
  { day: 'Tue', value: 92 },
  { day: 'Wed', value: 90 },
  { day: 'Thu', value: 95 },
  { day: 'Fri', value: 92 },
  { day: 'Sat', value: 97 },
]

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    api.get('/admin/stats')
      .then(r => setStats(r.data.data))
      .catch(() => toast.error('Could not load stats'))
      .finally(() => setLoading(false))
  }, [])

  const safeStats = stats || {
    total_students: 0,
    total_classes: 0,
    total_teachers: 0,
    avg_attendance_pct: 0,
    avg_task_completion_pct: 0,
    active_doubts: 0
  }

  return (
    <DashboardPageLayout
      title="Dashboard Overview"
      description="Real-time operational metrics and institutional performance tracking."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast.success("Exporting data...")}
          className="gap-2 border-slate-200 bg-white shadow-sm hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          Export Report
        </Button>
      }
    >
      <div className="space-y-8">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Enrollment */}
          <Card className="relative overflow-hidden border-slate-200/60 shadow-sm hover:shadow-md transition-all group">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Total Enrollment</CardDescription>
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <CardTitle className="text-3xl font-black text-slate-900 leading-none mt-2">
                {loading ? "..." : safeStats.total_students}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>+12 this month</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500/10" />
            </CardContent>
          </Card>

          {/* Attendance */}
          <Card className="relative overflow-hidden border-slate-200/60 shadow-sm hover:shadow-md transition-all group">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Avg Attendance</CardDescription>
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
              <CardTitle className="text-3xl font-black text-slate-900 leading-none mt-2">
                {loading ? "..." : `${safeStats.avg_attendance_pct}%`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 relative overflow-hidden">
                <div
                  className="absolute left-0 top-0 bottom-0 bg-blue-500 rounded-full transition-all duration-1000"
                  style={{ width: mounted ? `${safeStats.avg_attendance_pct}%` : '0%' }}
                />
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500/10" />
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card className="relative overflow-hidden border-slate-200/60 shadow-sm hover:shadow-md transition-all group">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Curriculum Coverage</CardDescription>
                <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-600 group-hover:scale-110 transition-transform">
                  <BookMarked className="h-4 w-4" />
                </div>
              </div>
              <CardTitle className="text-3xl font-black text-slate-900 leading-none mt-2">
                {loading ? "..." : `${safeStats.avg_task_completion_pct}%`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-600 border-violet-100 mt-1">
                Healthy Progress
              </Badge>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-violet-500/10" />
            </CardContent>
          </Card>

          {/* Doubts */}
          <Card className="relative overflow-hidden border-slate-200/60 shadow-sm hover:shadow-md transition-all group">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Pending Doubts</CardDescription>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${safeStats.active_doubts > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                  <MessageCircle className="h-4 w-4" />
                </div>
              </div>
              <CardTitle className="text-3xl font-black text-slate-900 leading-none mt-2">
                {loading ? "..." : safeStats.active_doubts}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[10px] font-semibold text-slate-400">Required teacher attention</p>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${safeStats.active_doubts > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`} />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Faculty Health */}
          <Card className="lg:col-span-1 border-slate-200/60 bg-white/50 backdrop-blur-sm self-start">
            <CardHeader>
              <CardTitle className="text-base font-bold">Faculty Status</CardTitle>
              <CardDescription>Teacher and classroom metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-0">
              <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/5 flex items-center justify-center text-blue-500 border border-blue-500/10">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-400 uppercase tracking-tighter">Teachers</span>
                    <span className="block text-lg font-black text-slate-900">{safeStats.total_teachers}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-violet-500/5 flex items-center justify-center text-violet-500 border border-violet-500/10">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-400 uppercase tracking-tighter">Classes</span>
                    <span className="block text-lg font-black text-slate-900">{safeStats.total_classes}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="pt-2">
                <Button variant="outline" className="w-full text-xs font-bold border-slate-200 hover:bg-slate-50 gap-2">
                  <UserPlus className="h-3.5 w-3.5" />
                  Faculty Management
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Growth Chart */}
          <Card className="lg:col-span-2 border-slate-200/60 bg-white shadow-sm flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base font-bold">Enrollment Velocity</CardTitle>
                <CardDescription>Daily student acquisition trend</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-none font-bold">
                +14.2% Growth
              </Badge>
            </CardHeader>
            <CardContent className="h-[300px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={SPARK_DATA}>
                  <defs>
                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorVal)"
                    animationDuration={2000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions Overhaul */}
        <div>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4" />
            Institution Control
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Classes', href: '/admin/classes', icon: BookOpen, color: 'text-violet-600', bg: 'bg-violet-500/5' },
              { label: 'Students', href: '/admin/students', icon: GraduationCap, color: 'text-emerald-600', bg: 'bg-emerald-500/5' },
              { label: 'Teachers', href: '/admin/teachers', icon: Users, color: 'text-blue-600', bg: 'bg-blue-500/5' },
              { label: 'Curriculum', href: '/admin/study-plans', icon: CalendarCheck, color: 'text-amber-600', bg: 'bg-amber-500/5' },
              { label: 'Settings', href: '/admin/settings', icon: SettingsIcon, color: 'text-slate-600', bg: 'bg-slate-500/5' },
            ].map((action, i) => (
              <a
                key={i}
                href={action.href}
                className="group flex flex-col items-center justify-center p-6 bg-white border border-slate-200/60 rounded-2xl hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300"
              >
                <div className={`h-12 w-12 rounded-xl ${action.bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}>
                  <action.icon className={`h-6 w-6 ${action.color}`} />
                </div>
                <span className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">{action.label}</span>
                <span className="text-[10px] font-medium text-slate-400 mt-1 uppercase">Configure &rarr;</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </DashboardPageLayout>
  )
}