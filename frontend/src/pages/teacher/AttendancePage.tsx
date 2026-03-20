import { useEffect, useState } from 'react'
import { Save, CheckCircle2, XCircle, Clock, Calendar as CalendarIcon, Users, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

type Status = 'present' | 'absent' | 'late'
interface Student { id: string; name: string }
interface ClassItem { id: string; name: string }

const STATUS_OPTS: { v: Status; label: string; icon: any; cls: string; activeCls: string }[] = [
  { v: 'present', label: 'Present', icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50 border-emerald-100', activeCls: 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-200' },
  { v: 'late', label: 'Late', icon: Clock, cls: 'text-amber-600 bg-amber-50 border-amber-100', activeCls: 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-200' },
  { v: 'absent', label: 'Absent', icon: XCircle, cls: 'text-rose-600 bg-rose-50 border-rose-100', activeCls: 'bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-200' },
]

export default function AttendancePage() {
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [classId, setClassId] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/teacher/classes').then(r => {
      setClasses(r.data.data)
      if (r.data.data.length > 0) setClassId(r.data.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!classId) return
    setLoading(true)
    api.get(`/teacher/students?class_id=${classId}`)
      .then(r => {
        setStudents(r.data.data)
        const defaults: Record<string, Status> = {}
        r.data.data.forEach((s: Student) => { defaults[s.id] = 'present' })
        setStatuses(defaults)
      })
      .catch(() => toast.error('Could not load students'))
      .finally(() => setLoading(false))
  }, [classId])

  const markAll = (status: Status) => {
    const next: Record<string, Status> = {}
    students.forEach(s => { next[s.id] = status })
    setStatuses(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.post('/teacher/attendance', {
        class_id: classId,
        session_date: date,
        records: students.map(s => ({ student_id: s.id, status: statuses[s.id] ?? 'absent' })),
      })
      toast.success('Attendance successfully recorded')
    } catch { toast.error('Failed to save attendance') }
    finally { setSaving(false) }
  }

  return (
    <DashboardPageLayout
      title="Attendance"
      description="Record and track student participation for today's sessions."
      actions={
        <div className="flex items-center gap-3">
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-[180px] bg-white border-slate-200 shadow-sm h-10">
              <SelectValue placeholder="Select Class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => setDate(e.target.value)}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      }
    >
      <div className="space-y-6">
        {/* Bulk Action Header */}
        {students.length > 0 && (
          <Card className="border-slate-200/60 bg-slate-50/50 shadow-sm overflow-hidden">
            <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Quick Mark All</span>
              </div>
              <div className="flex items-center gap-2">
                {STATUS_OPTS.map(opt => (
                  <Button
                    key={opt.v}
                    variant="outline"
                    size="sm"
                    onClick={() => markAll(opt.v)}
                    className={clsx("h-8 text-[10px] font-black uppercase tracking-wider gap-1.5 transition-all bg-white border-slate-200", opt.cls)}
                  >
                    <opt.icon className="h-3 w-3" />
                    {opt.v}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Student Roster */}
        <Card className="border-slate-200/60 shadow-xl shadow-slate-200/20 overflow-hidden bg-white/50 backdrop-blur-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 p-6 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-black text-slate-900">Session Roster</CardTitle>
              <CardDescription>{students.length} students enrolled in this session.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-4">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-16 w-full bg-slate-50 animate-pulse rounded-xl" />)}
              </div>
            ) : students.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                  <CalendarIcon className="h-8 w-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">No session data</h3>
                <p className="text-sm text-slate-500 max-w-xs mt-2 leading-relaxed">
                  Select a class above to begin marking attendance for students.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {students.map((s) => (
                  <div key={s.id} className="group flex flex-col sm:flex-row sm:items-center gap-4 p-4 px-6 hover:bg-slate-50/80 transition-all">
                    <div className="flex items-center gap-4 flex-1">
                      <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-slate-100">
                        <AvatarFallback className="bg-primary/5 text-primary font-black uppercase text-xs">
                          {s.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-bold text-slate-900">{s.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {STATUS_OPTS.map(opt => {
                        const isActive = statuses[s.id] === opt.v
                        return (
                          <Button
                            key={opt.v}
                            size="sm"
                            variant="outline"
                            onClick={() => setStatuses(p => ({ ...p, [s.id]: opt.v }))}
                            className={clsx(
                              "flex-1 sm:flex-none h-9 px-4 text-[10px] font-black uppercase tracking-wider gap-1.5 transition-all",
                              isActive ? opt.activeCls : "bg-white border-slate-200 text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                            )}
                          >
                            <opt.icon className="h-3.5 w-3.5" />
                            {opt.label}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>

          {students.length > 0 && !loading && (
            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-end">
              <Button
                onClick={save}
                disabled={saving}
                className="gap-2 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 px-8 font-black uppercase text-xs tracking-widest h-11"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Save Attendance
                  </>
                )}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </DashboardPageLayout>
  )
}
