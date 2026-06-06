import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronRight, Clock, User, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import { studyPlanQueryOptions } from '@/lib/studyPlanQueries'
import { formatDistanceToNow, isValid, parseISO } from 'date-fns'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { clsx } from 'clsx'
import { bandedTableHeadCellClass, bandedTableHeadClass, bandedTableRowClass, teacherStudentRowGridClass } from '@/lib/tableBandStyles'
import { Badge } from '@/components/ui/badge'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { TeacherStudentProfileModal } from '@/components/teacher/TeacherStudentProfileModal'

interface Student {
  id: string
  name: string
  phone?: string
  class_id?: string
  class_name?: string
  last_login_at?: string | null
  last_checkin?: string
  status?: string
  classes?: { id: string; name: string }[]
}

interface MyClass {
  id: string
  name: string
}

const STATUS_STYLES: Record<string, string> = {
  Active: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  Struggling: 'text-amber-700 bg-amber-50 border-amber-200',
  Absent: 'text-red-700 bg-red-50 border-red-200',
  Excelling: 'text-blue-700 bg-blue-50 border-blue-200',
}

function formatLastSeen(iso?: string | null) {
  if (!iso) return 'Never'
  try {
    const d = parseISO(iso)
    if (!isValid(d)) return 'Never'
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return 'Never'
  }
}

export default function TeacherStudentsPage() {
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [selected, setSelected] = useState<Student | null>(null)

  const { data: classes = [] } = useQuery({
    queryKey: queryKeys.teacher.classes(),
    queryFn: async (): Promise<MyClass[]> =>
      (await api.get('/teacher/classes')).data.data || [],
  })

  const activeClassId =
    classFilter !== 'all' ? classFilter : (classes[0]?.id ?? '')

  const {
    data: students = [],
    isLoading: loading,
    isError: studentsError,
  } = useQuery({
    queryKey: queryKeys.teacher.studentsByClass(activeClassId),
    enabled: Boolean(activeClassId),
    queryFn: async (): Promise<Student[]> => {
      const res = await api.get('/teacher/students', {
        params: { class_id: activeClassId, page: 1, limit: 100 },
      })
      return res.data.data || []
    },
    ...studyPlanQueryOptions(),
  })

  useEffect(() => {
    if (studentsError) toast.error('Could not load students')
  }, [studentsError])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('class')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const filtered = students.filter(
    (s) =>
      (s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone || '').includes(search)) &&
      (classFilter === 'all' || s.class_id === classFilter)
  )

  return (
    <DashboardPageLayout
      title="My Students"
      description="Track progress and manage your classroom."
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-slate-200 rounded-xl hidden sm:flex"
            onClick={() => {
              const csv = [
                'Name,Phone,Class,Status,Last check-in',
                ...filtered.map(
                  (s) =>
                    `"${s.name.replace(/"/g, '""')}",${s.phone || ''},${s.class_name || ''},${s.status || 'Active'},${formatLastSeen(s.last_login_at)}`
                ),
              ].join('\n')
              const a = document.createElement('a')
              a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
              a.download = 'students.csv'
              a.click()
              toast.success('Exported!')
            }}
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students..."
            className="pl-9 h-10 border-slate-200 rounded-xl bg-white"
          />
        </div>
        {classes.length > 1 && (
          <div className="relative shrink-0 w-full sm:w-44">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="h-10 w-full border-slate-200 rounded-xl bg-white">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div
              className={clsx(
                'hidden sm:grid px-5 py-3 text-[10px] font-bold uppercase tracking-wider',
                teacherStudentRowGridClass,
                bandedTableHeadClass,
                bandedTableHeadCellClass,
              )}
            >
              <span>Student Name</span>
              <span className="shrink-0">ID</span>
              <span className="hidden md:block shrink-0">Last Check-In</span>
              <span className="shrink-0">Status</span>
              <span className="shrink-0" aria-hidden />
            </div>
            {loading ? (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-slate-100 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3.5 w-32 bg-slate-100 rounded" />
                    <div className="h-3 w-20 bg-slate-100 rounded" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                  <User className="h-7 w-7 text-slate-300" />
                </div>
                <h3 className="text-base font-bold text-slate-700">No students yet</h3>
                <p className="text-sm text-slate-400 mt-1 max-w-xs">
                  Ask your coordinator to assign students to your class.
                </p>
              </div>
            ) : (
              <div>
                {filtered.map((s, index) => {
                  const status = s.status || 'Active'
                  const initials = s.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                  const seen = formatLastSeen(s.last_login_at)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelected(s)}
                      className={clsx(
                        'w-full px-5 py-4 transition-colors text-left group border-b border-slate-100/80 last:border-b-0',
                        teacherStudentRowGridClass,
                        bandedTableRowClass(index),
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-10 w-10 border border-slate-100 shrink-0">
                          <AvatarFallback className="text-xs bg-blue-50 text-blue-700 font-bold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{s.name}</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {(s.classes?.length ?? 0) > 0 ? (
                              s.classes!.map((c) => (
                                <Badge
                                  key={c.id}
                                  variant="secondary"
                                  className="text-[8px] px-1.5 py-0 h-3.5 bg-slate-100 text-slate-500 border-none"
                                >
                                  {c.name}
                                </Badge>
                              ))
                            ) : (
                              <p className="text-xs text-slate-400 truncate">{s.class_name || 'No class'}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 font-mono shrink-0 whitespace-nowrap">#{s.id.slice(-4).toUpperCase()}</span>
                      <span className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{seen}</span>
                      </span>
                      <span
                        className={clsx(
                          'text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 whitespace-nowrap justify-self-start',
                          STATUS_STYLES[status] || STATUS_STYLES.Active,
                        )}
                      >
                        {status}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500 transition-colors justify-self-end" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <TeacherStudentProfileModal
        student={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      />
    </DashboardPageLayout>
  )
}
