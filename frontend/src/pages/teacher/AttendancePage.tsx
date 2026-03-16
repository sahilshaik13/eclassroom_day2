import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/services/api'

type Status = 'present' | 'absent' | 'late'
interface Student { id: string; name: string }
interface ClassItem { id: string; name: string }

const STATUS_OPTS: { v: Status; label: string; cls: string }[] = [
  { v: 'present', label: 'P', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { v: 'late',    label: 'L', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { v: 'absent',  label: 'A', cls: 'bg-red-100 text-red-600 border-red-200' },
]

export default function AttendancePage() {
  const [classes, setClasses]   = useState<ClassItem[]>([])
  const [classId, setClassId]   = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)

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
      toast.success('Attendance saved!')
    } catch { toast.error('Could not save attendance') }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-xl text-ink">Attendance</h1>
        <p className="text-sm text-ink-muted mt-0.5">Mark attendance for a session</p>
      </div>

      {/* Controls */}
      <div className="card mb-5 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="label">Class</label>
          <select value={classId} onChange={e => setClassId(e.target.value)} className="input">
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Session Date</label>
          <input type="date" value={date} max={new Date().toISOString().slice(0,10)}
            onChange={e => setDate(e.target.value)} className="input" />
        </div>
      </div>

      {/* Bulk actions */}
      {students.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-ink-muted font-medium">Mark all:</span>
          {STATUS_OPTS.map(opt => (
            <button key={opt.v} onClick={() => markAll(opt.v)}
              className={clsx('px-3 py-1 rounded-lg text-xs font-semibold border transition-colors', opt.cls)}>
              {opt.v}
            </button>
          ))}
          <span className="ml-auto text-xs text-ink-faint">{students.length} students</span>
        </div>
      )}

      {/* Student rows */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      ) : (
        <div className="card divide-y divide-border mb-5">
          {students.map(s => (
            <div key={s.id} className="flex items-center justify-between py-3 px-1 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-surface-alt border border-border flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-ink-muted">{s.name.charAt(0)}</span>
                </div>
                <span className="text-sm font-medium text-ink">{s.name}</span>
              </div>
              <div className="flex gap-1.5">
                {STATUS_OPTS.map(opt => (
                  <button key={opt.v}
                    onClick={() => setStatuses(p => ({ ...p, [s.id]: opt.v }))}
                    className={clsx(
                      'w-8 h-8 rounded-lg text-xs font-bold border transition-all',
                      statuses[s.id] === opt.v ? opt.cls : 'bg-surface-alt border-border text-ink-faint hover:border-border',
                    )}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {students.length === 0 && (
            <p className="text-sm text-ink-muted text-center py-8">Select a class to see students.</p>
          )}
        </div>
      )}

      {students.length > 0 && (
        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? 'Saving…' : <><Save className="w-4 h-4" /> Save Attendance</>}
        </button>
      )}
    </div>
  )
}
