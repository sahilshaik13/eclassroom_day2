import { useEffect, useState } from 'react'
import {
  X,
  User,
  School,
  BarChart2,
  StickyNote,
  Send,
  Calendar,
  Flame,
  Mail,
  Phone,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'
import api from '@/services/api'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

type Student = {
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

/** Matches the academic bucket labels returned by the report payload. */
const ACADEMIC = [
  {
    match: 'Hifz',
    label: 'Hifz',
    sub: 'Plan average (memorisation)',
    bar: 'bg-blue-900',
    pct: 'text-blue-900',
  },
  {
    match: 'Kubra',
    label: 'Kubra',
    sub: 'Retention focus',
    bar: 'bg-emerald-500',
    pct: 'text-emerald-600',
  },
  {
    match: 'Sughra',
    label: 'Sughra',
    sub: 'Consistency',
    bar: 'bg-violet-500',
    pct: 'text-violet-600',
  },
  {
    match: 'Tajweed',
    label: 'Tajweed',
    sub: 'Theory & drills',
    bar: 'bg-amber-500',
    pct: 'text-amber-600',
  },
] as const

function pctFromGrid(grid: { task_type: string; type_average: number | null }[] | undefined, match: string) {
  const row = grid?.find((g) => g.task_type === match)
  return row?.type_average ?? 0
}

function pctFromBuckets(
  summaries: { label: string; progress_pct: number }[] | undefined,
  match: string
) {
  const row = summaries?.find((item) => item.label === match)
  return row?.progress_pct ?? 0
}

function fmtLogin(iso?: string | null) {
  if (!iso) return 'Never'
  try {
    const d = parseISO(iso)
    if (!isValid(d)) return 'Never'
    return `${format(d, 'EEE, MMM d')} · ${format(d, 'h:mm a')} (${formatDistanceToNow(d, { addSuffix: true })})`
  } catch {
    return 'Never'
  }
}

function fmtNoteTime(iso?: string | null) {
  if (!iso) return ''
  try {
    const d = parseISO(iso)
    if (!isValid(d)) return ''
    if (formatDistanceToNow(d, { addSuffix: true }).includes('hour')) {
      return format(d, 'h:mm a')
    }
    return format(d, 'MMM d')
  } catch {
    return ''
  }
}

function fmtAttDate(d: string) {
  try {
    const x = parseISO(typeof d === 'string' && d.length <= 10 ? d + 'T12:00:00' : d)
    if (!isValid(x)) return d
    if (format(x, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')) {
      return `Today, ${format(x, 'MMM d')}`
    }
    return format(x, 'EEE, MMM d')
  } catch {
    return d
  }
}

type Overview = {
  last_login_at: string | null
  attendance_streak: number
  attendance_history: { date: string; status: string; details: string }[]
  notes: { type: string; time: string; content: string; variant: string }[]
}

type Report = {
  overall_percentage: number
  grid: { task_type: string; type_average: number | null; days: Record<string, number> }[]
  bucket_summaries?: { bucket: string; label: string; progress_pct: number }[]
}

export function TeacherStudentProfileModal({
  student,
  open,
  onOpenChange,
  onManageAccount,
}: {
  student: Student | null
  open: boolean
  onOpenChange: (v: boolean) => void
  /** When set (e.g. admin portal), shows a control to open account/enrollment management. */
  onManageAccount?: () => void
}) {
  const [report, setReport] = useState<Report | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(false)
  const [attendancePage, setAttendancePage] = useState(0)
  const ATTENDANCE_ROWS_PER_PAGE = 7

  useEffect(() => {
    if (!open || !student) {
      setReport(null)
      setOverview(null)
      return
    }
    const now = new Date()
    setLoading(true)
    Promise.all([
      api.get<{
        data: Report
      }>(`/teacher/students/${student.id}/report`, {
        params: { month: now.getMonth() + 1, year: now.getFullYear() },
      }),
      api.get<{ data: Overview }>(`/teacher/students/${student.id}/overview`),
    ])
      .then(([repRes, ovRes]) => {
        setReport(repRes.data.data)
        setOverview(ovRes.data.data)
      })
      .catch(() => toast.error('Could not load student report'))
      .finally(() => setLoading(false))
  }, [open, student?.id])

  useEffect(() => {
    setAttendancePage(0)
  }, [student?.id, open, overview?.attendance_history?.length])

  if (!student) return null

  const status = student.status || 'Active'
  const phone = (student.phone || '').replace(/\s/g, '')
  const lastIso = student.last_login_at ?? overview?.last_login_at ?? null
  const attendanceRows = overview?.attendance_history ?? []
  const attendancePages = Math.max(1, Math.ceil(attendanceRows.length / ATTENDANCE_ROWS_PER_PAGE))
  const safeAttendancePage = Math.min(attendancePage, attendancePages - 1)
  const attendanceSliceStart = safeAttendancePage * ATTENDANCE_ROWS_PER_PAGE
  const currentAttendanceRows = attendanceRows.slice(
    attendanceSliceStart,
    attendanceSliceStart + ATTENDANCE_ROWS_PER_PAGE
  )
  const emptyAttendanceRows = Math.max(0, ATTENDANCE_ROWS_PER_PAGE - currentAttendanceRows.length)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0 gap-0 bg-slate-50 flex flex-col border-slate-200">
        <div className="bg-white border-b border-slate-200 p-3.5 sm:p-4 md:p-6 flex items-start justify-between gap-3 sm:gap-4 sticky top-0 z-10">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="relative shrink-0">
              <div className="h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 ring-2 sm:ring-4 ring-slate-50">
                <User className="h-7 w-7 sm:h-9 sm:w-9 md:h-11 md:w-11" />
              </div>
              {status === 'Active' && (
                <span className="absolute -bottom-1 -right-1 h-4 w-4 bg-emerald-500 border-2 border-white rounded-full" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 truncate">{student.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 text-xs sm:text-sm text-slate-500">
                <span>#{student.id.slice(-4).toUpperCase()}</span>
                <span className="hidden sm:inline">•</span>
                <Badge
                  className={clsx(
                    'text-xs font-medium border',
                    status === 'Active'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  )}
                >
                  {status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2 sm:mt-3">
                {(student.classes?.length ?? 0) > 0 ? (
                  student.classes!.map((c) => (
                    <div
                      key={c.id}
                      className="flex min-w-0 max-w-full items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-md text-[11px] sm:text-xs text-indigo-700 font-medium border border-indigo-100"
                      title={c.name}
                    >
                      <School className="h-3 w-3 shrink-0" />
                      <span className="truncate">{c.name}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md text-[11px] sm:text-xs text-slate-600 border border-slate-200">
                    <School className="h-3 w-3" />
                    {student.class_name || 'No class'}
                  </div>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-1.5 sm:mt-2">
                Last check-in:{' '}
                <span className="font-semibold text-slate-800">{fmtLogin(lastIso)}</span>
              </p>
              {onManageAccount ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-8 rounded-xl border-slate-200 text-slate-700 font-semibold sm:hidden"
                  onClick={() => onManageAccount()}
                >
                  Account
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onManageAccount ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex rounded-xl border-slate-200 text-slate-700 font-semibold"
                onClick={() => onManageAccount()}
              >
                Account & enrollment
              </Button>
            ) : null}
            <button
              type="button"
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full shrink-0"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-3.5 sm:p-5 md:p-6 space-y-4 sm:space-y-6">
          {loading && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Loading report…
            </div>
          )}

          {!loading && (
            <>
              <section>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                  <BarChart2 className="h-5 w-5 text-blue-900 shrink-0" />
                  Academic Progress
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {ACADEMIC.map((a) => {
                    const pct = pctFromBuckets(report?.bucket_summaries, a.match) || pctFromGrid(report?.grid, a.match)
                    return (
                      <div
                        key={a.match}
                        className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-slate-200"
                      >
                        <div className="flex justify-between items-center mb-2.5">
                          <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide">{a.label}</span>
                          <span className={clsx('text-base sm:text-lg font-bold', a.pct)}>
                            {pct}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                          <div
                            className={clsx(a.bar, 'h-1.5 rounded-full transition-all')}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <div className="text-[10px] sm:text-xs text-slate-500 leading-snug">{a.sub}</div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="order-2 lg:order-1 lg:col-span-1 flex flex-col gap-4 sm:gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <StickyNote className="h-4 w-4 text-slate-400" />
                        Notes
                      </h3>
                    </div>
                    <div className="p-4 flex-1 space-y-3 max-h-[280px] overflow-y-auto">
                      {(overview?.notes?.length ?? 0) > 0 ? (
                        overview!.notes.map((note, index) => (
                          <div
                            key={index}
                            className={clsx(
                              'p-3 rounded-lg border',
                              note.variant === 'amber'
                                ? 'bg-amber-50 border-amber-100'
                                : 'bg-indigo-50 border-indigo-100'
                            )}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <span
                                className={clsx(
                                  'text-[10px] font-bold uppercase',
                                  note.variant === 'amber' ? 'text-amber-800' : 'text-indigo-800'
                                )}
                              >
                                {note.type}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {fmtNoteTime(note.time)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">{note.content}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400 text-center py-6">No notes yet.</p>
                      )}
                    </div>
                    <div className="p-3 border-t border-slate-100 bg-slate-50/30">
                      <div className="relative">
                        <input
                          readOnly
                          className="w-full bg-white border-slate-200 rounded-lg text-xs pl-3 pr-9 py-2 text-slate-500"
                          placeholder="Notes are added when students send doubts"
                          type="text"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300">
                          <Send className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide mb-3">
                      Quick actions
                    </h3>
                    <div className="space-y-2">
                      <a
                        href={phone ? `sms:${phone}` : undefined}
                        className={clsx(
                          'w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all shadow-sm',
                          phone
                            ? 'text-white bg-blue-600 hover:bg-blue-700'
                            : 'text-slate-400 bg-slate-100 cursor-not-allowed pointer-events-none'
                        )}
                        onClick={(e) => !phone && e.preventDefault()}
                      >
                        <Mail className="h-4 w-4" />
                        Message
                      </a>
                      <a
                        href={phone ? `tel:${phone}` : undefined}
                        className={clsx(
                          'w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-all',
                          phone
                            ? 'text-slate-700 bg-white border-slate-200 hover:bg-slate-50'
                            : 'text-slate-400 bg-slate-50 border-slate-100 cursor-not-allowed pointer-events-none'
                        )}
                        onClick={(e) => !phone && e.preventDefault()}
                      >
                        <Phone className="h-4 w-4" />
                        Call
                      </a>
                    </div>
                  </div>
                </div>

                <div className="order-1 lg:order-2 lg:col-span-2">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
                    <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                      <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        Attendance
                      </h3>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="flex items-center gap-1 text-sm font-bold text-slate-800">
                          <span className="hidden sm:inline text-xs text-slate-400 font-semibold uppercase mr-1">Streak</span>
                          {overview?.attendance_streak ?? 0}
                          <Flame className="h-4 w-4 text-orange-500" />
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg"
                            disabled={safeAttendancePage <= 0}
                            onClick={() => setAttendancePage((p) => Math.max(0, p - 1))}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-[10px] font-semibold text-slate-400 min-w-[44px] text-center">
                            {attendancePages === 0 ? '0/0' : `${safeAttendancePage + 1}/${attendancePages}`}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg"
                            disabled={safeAttendancePage >= attendancePages - 1}
                            onClick={() => setAttendancePage((p) => Math.min(attendancePages - 1, p + 1))}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-50/50 text-xs text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                          <tr>
                            <th className="px-4 py-2">Date</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {attendanceRows.length > 0 ? (
                            <>
                              {currentAttendanceRows.map((row, idx) => (
                                <tr key={idx}>
                                  <td className="px-4 py-2.5 text-slate-900 font-medium whitespace-nowrap">
                                    {fmtAttDate(row.date)}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span
                                      className={clsx(
                                        'inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border',
                                        row.status?.toLowerCase() === 'present'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : row.status?.toLowerCase() === 'absent'
                                            ? 'bg-red-50 text-red-700 border-red-200'
                                            : 'bg-amber-50 text-amber-800 border-amber-200'
                                      )}
                                    >
                                      {row.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-600">{row.details}</td>
                                </tr>
                              ))}
                              {Array.from({ length: emptyAttendanceRows }).map((_, idx) => (
                                <tr key={`empty-${idx}`} className="bg-slate-50/20">
                                  <td className="px-4 py-2.5 text-transparent select-none">—</td>
                                  <td className="px-4 py-2.5 text-transparent select-none">—</td>
                                  <td className="px-4 py-2.5 text-transparent select-none">—</td>
                                </tr>
                              ))}
                            </>
                          ) : (
                            <tr>
                              <td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-sm">
                                No attendance recorded yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
