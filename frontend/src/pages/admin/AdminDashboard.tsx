import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  GraduationCap,
  BookOpen,
  MessageCircle,
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
import { queryKeys } from '@/lib/queryKeys'
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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const { data: stats, isPending: loading, isError } = useQuery({
    queryKey: queryKeys.admin.stats(),
    queryFn: async () => {
      const r = await api.get<{ data: AdminStats }>('/admin/stats')
      return r.data.data
    },
    staleTime: 0,
  })

  useEffect(() => {
    if (isError) toast.error('Could not load stats')
  }, [isError])

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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {/* Enrollment */}
          <Card className="relative overflow-hidden border-emerald-200/70 bg-emerald-50/70 shadow-sm transition-all group">
            <CardHeader className="p-3 pb-1.5 sm:p-4 sm:pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="font-bold text-[10px] uppercase tracking-wider text-slate-500">Total Enrollment</CardDescription>
                <div className="hidden h-8 w-8 rounded-lg bg-emerald-500/10 sm:flex items-center justify-center text-emerald-600">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <CardTitle className="text-2xl sm:text-3xl font-black text-slate-900 leading-none mt-1.5 sm:mt-2">
                {loading ? "..." : safeStats.total_students}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>+12 this month</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500/10" />
            </CardContent>
          </Card>

          {/* Attendance */}
          <Card className="relative overflow-hidden border-blue-200/70 bg-blue-50/70 shadow-sm transition-all group">
            <CardHeader className="p-3 pb-1.5 sm:p-4 sm:pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="font-bold text-[10px] uppercase tracking-wider text-slate-500">Avg Attendance</CardDescription>
                <div className="hidden h-8 w-8 rounded-lg bg-blue-500/10 sm:flex items-center justify-center text-blue-600">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
              <CardTitle className="text-2xl sm:text-3xl font-black text-slate-900 leading-none mt-1.5 sm:mt-2">
                {loading ? "..." : `${safeStats.avg_attendance_pct}%`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
              <div className="w-full h-1.5 bg-blue-100/80 rounded-full mt-2 relative overflow-hidden">
                <div
                  className="absolute left-0 top-0 bottom-0 bg-blue-500 rounded-full transition-all duration-1000"
                  style={{ width: mounted ? `${safeStats.avg_attendance_pct}%` : '0%' }}
                />
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500/10" />
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card className="relative overflow-hidden border-violet-200/70 bg-violet-50/70 shadow-sm transition-all group">
            <CardHeader className="p-3 pb-1.5 sm:p-4 sm:pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="font-bold text-[10px] uppercase tracking-wider text-slate-500">Curriculum Coverage</CardDescription>
                <div className="hidden h-8 w-8 rounded-lg bg-violet-500/10 sm:flex items-center justify-center text-violet-600">
                  <BookMarked className="h-4 w-4" />
                </div>
              </div>
              <CardTitle className="text-2xl sm:text-3xl font-black text-slate-900 leading-none mt-1.5 sm:mt-2">
                {loading ? "..." : `${safeStats.avg_task_completion_pct}%`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
              <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-600 border-violet-100 mt-1">
                Healthy Progress
              </Badge>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-violet-500/10" />
            </CardContent>
          </Card>

          {/* Doubts */}
          <Card className={`relative overflow-hidden shadow-sm transition-all group ${safeStats.active_doubts > 0 ? 'border-amber-200/70 bg-amber-50/70' : 'border-emerald-200/70 bg-emerald-50/70'}`}>
            <CardHeader className="p-3 pb-1.5 sm:p-4 sm:pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="font-bold text-[10px] uppercase tracking-wider text-slate-500">Pending Doubts</CardDescription>
                <div className={`hidden h-8 w-8 rounded-lg sm:flex items-center justify-center ${safeStats.active_doubts > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                  <MessageCircle className="h-4 w-4" />
                </div>
              </div>
              <CardTitle className="text-2xl sm:text-3xl font-black text-slate-900 leading-none mt-1.5 sm:mt-2">
                {loading ? "..." : safeStats.active_doubts}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
              <p className="text-[10px] font-semibold text-slate-500">Required teacher attention</p>
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {[
              { label: 'Classes', href: '/admin/classes', icon: BookOpen, color: 'text-violet-600', bg: 'bg-violet-500/5' },
              { label: 'Students', href: '/admin/students', icon: GraduationCap, color: 'text-emerald-600', bg: 'bg-emerald-500/5' },
              { label: 'Teachers', href: '/admin/teachers', icon: Users, color: 'text-blue-600', bg: 'bg-blue-500/5' },
              { label: 'Settings', href: '/admin/settings', icon: SettingsIcon, color: 'text-slate-600', bg: 'bg-slate-500/5' },
            ].map((action, i) => (
              <a
                key={i}
                href={action.href}
                className="group flex flex-col items-center justify-center rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3.5 sm:p-4 lg:p-5 min-h-[112px] sm:min-h-[124px] hover:border-primary/30 hover:shadow-md transition-all duration-200"
              >
                <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl ${action.bg} flex items-center justify-center mb-2.5`}>
                  <action.icon className={`h-5 w-5 ${action.color}`} />
                </div>
                <span className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors text-center leading-tight">{action.label}</span>
                <span className="text-[10px] font-semibold text-slate-400 mt-1 uppercase">Configure &rarr;</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </DashboardPageLayout>
  )
}