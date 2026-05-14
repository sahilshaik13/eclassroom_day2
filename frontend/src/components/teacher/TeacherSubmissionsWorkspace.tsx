import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  Loader2,
  User,
  BadgeCheck,
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  FileText,
  Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels'
import clsx from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'

export type TeacherSubmissionsLayout = 'page' | 'embedded'

interface TeacherSubmissionsWorkspaceProps {
  layout?: TeacherSubmissionsLayout
}

export function TeacherSubmissionsWorkspace({ layout = 'page' }: TeacherSubmissionsWorkspaceProps) {
  const navigate = useNavigate()
  const embedded = layout === 'embedded'
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [selectedStudent, setSelectedStudent] = useState<any>(null)
  const [progressData, setProgressData] = useState<any>(null)
  const [loadingProgress, setLoadingProgress] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    setLoading(true)
    try {
      const classesRes = await api.get('/teacher/classes')
      const classList = classesRes.data.data
      setClasses(classList)

      if (classList.length > 0) {
        const firstClassId = classList[0].id
        setSelectedClassId(firstClassId)
        await loadStudents(firstClassId)
      }
    } catch {
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const loadStudents = async (classId: string) => {
    try {
      const studentsRes = await api.get('/teacher/students', { params: { class_id: classId } })
      setStudents(studentsRes.data.data)
    } catch (err) {
      console.error('Failed to load students', err)
    }
  }

  const loadStudentProgress = async (studentId: string) => {
    if (!selectedClassId) return
    setLoadingProgress(true)
    try {
      const res = await api.get(`/teacher/students/${studentId}/study-plan/${selectedClassId}/progress`)
      setProgressData(res.data.data)
    } catch {
      toast.error('Failed to load student progress')
    } finally {
      setLoadingProgress(false)
    }
  }

  const handleStudentSelect = (student: any) => {
    setSelectedStudent(student)
    loadStudentProgress(student.id)
  }

  useEffect(() => {
    if (selectedClassId) {
      loadStudents(selectedClassId)
    }

    if (selectedStudent) {
      const isInNewClass = selectedStudent.classes.some((c: any) => c.id === selectedClassId)
      if (isInNewClass) {
        loadStudentProgress(selectedStudent.id)
      } else {
        setSelectedStudent(null)
        setProgressData(null)
      }
    }
  }, [selectedClassId])

  const filteredStudents = students.filter((s) => s.classes.some((c: any) => c.id === selectedClassId))

  const classSelect = (
    <Select value={selectedClassId} onValueChange={setSelectedClassId}>
      <SelectTrigger
        className={clsx(
          embedded ? 'w-full sm:w-[200px] h-9 text-sm rounded-lg border-slate-200 bg-white' : 'w-[220px] rounded-xl font-bold border-slate-200 bg-white'
        )}
      >
        <SelectValue>{classes.find((c) => c.id === selectedClassId)?.name || 'Select Class'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {classes.map((c) => (
          <SelectItem key={c.id} value={c.id} className={embedded ? 'text-sm' : 'font-bold'}>
            {c.name || 'Unnamed Class'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  if (loading) {
    const spinner = (
      <div className={clsx('flex items-center justify-center', embedded ? 'py-16' : 'h-[60vh]')}>
        <Loader2 className={clsx('animate-spin text-blue-600', embedded ? 'h-8 w-8' : 'h-12 w-12')} />
      </div>
    )
    if (embedded) {
      return (
        <section className="space-y-4">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Submissions</h2>
              <p className="text-xs text-slate-500">Study plan tasks awaiting your review.</p>
            </div>
          </header>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{spinner}</div>
        </section>
      )
    }
    return spinner
  }

  const inner = (
    <div className={clsx('grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8', embedded && 'gap-5 lg:gap-6')}>
      {/* Student list */}
      <div className={clsx('space-y-3 lg:col-span-3', embedded && 'lg:col-span-4')}>
        <div className="flex items-center justify-between px-0.5">
          <h3
            className={clsx(
              'uppercase tracking-wider text-slate-500',
              embedded ? 'text-[10px] font-medium' : 'text-[10px] font-black tracking-widest text-slate-400'
            )}
          >
            Students
          </h3>
          <Badge
            variant="secondary"
            className={clsx(
              'rounded-md border-0 bg-slate-100 text-slate-600',
              embedded ? 'text-[10px] px-1.5 py-0 h-5 font-normal' : 'rounded-lg px-2 py-0.5'
            )}
          >
            {filteredStudents.length}
          </Badge>
        </div>

        <div className={clsx('grid gap-2 overflow-y-auto pr-1', embedded ? 'max-h-[min(380px,50vh)]' : 'max-h-[70vh] pr-2')}>
          {filteredStudents.map((student) => (
            <Card
              key={student.id}
              className={clsx(
                'cursor-pointer border shadow-none transition-colors',
                embedded ? 'rounded-xl border-slate-200' : 'rounded-2xl border-none shadow-sm',
                selectedStudent?.id === student.id
                  ? embedded
                    ? 'border-indigo-300 bg-indigo-50/80 ring-1 ring-indigo-200'
                    : 'bg-indigo-600 shadow-indigo-200'
                  : embedded
                    ? 'bg-white hover:bg-slate-50'
                    : 'bg-white hover:bg-slate-50 group'
              )}
              onClick={() => handleStudentSelect(student)}
            >
              <CardContent className={clsx('space-y-2', embedded ? 'p-3' : 'space-y-3 p-4')}>
                <div className="flex items-center gap-3">
                  <div
                    className={clsx(
                      'flex items-center justify-center rounded-lg transition-colors',
                      embedded ? 'h-9 w-9' : 'h-10 w-10 rounded-xl',
                      selectedStudent?.id === student.id
                        ? embedded
                          ? 'bg-white text-indigo-600'
                          : 'bg-white/20 text-white'
                        : embedded
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                    )}
                  >
                    <User className={embedded ? 'h-4 w-4' : 'h-5 w-5'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={clsx(
                        'truncate font-medium text-slate-900',
                        embedded ? 'text-sm' : 'font-black text-sm',
                        selectedStudent?.id === student.id && !embedded && 'text-white'
                      )}
                    >
                      {student.name}
                    </p>
                    <p
                      className={clsx(
                        'truncate text-slate-500',
                        embedded ? 'text-[11px]' : 'text-[10px] font-bold uppercase tracking-tight opacity-70',
                        selectedStudent?.id === student.id && !embedded && 'text-indigo-100'
                      )}
                    >
                      {student.phone || 'No phone'}
                    </p>
                  </div>
                  {selectedStudent?.id === student.id && (
                    <ChevronRight className={clsx('text-slate-400', embedded ? 'h-4 w-4' : 'h-4 w-4 text-white/50')} />
                  )}
                </div>

                {student.progress && (
                  <div
                    className={clsx(
                      'flex items-center justify-between gap-4 border-t pt-2',
                      selectedStudent?.id === student.id && !embedded ? 'border-white/10' : 'border-slate-100'
                    )}
                  >
                    <div className="flex-1">
                      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                        <span>{student.progress.average_score}%</span>
                        <span className="font-medium text-slate-700">
                          {student.progress.completed}/{student.progress.total}
                        </span>
                      </div>
                      <Progress
                        value={student.progress.pct}
                        className="h-1 bg-black/5"
                        indicatorClassName={
                          selectedStudent?.id === student.id && !embedded ? 'bg-white' : 'bg-indigo-500'
                        }
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {filteredStudents.length === 0 && (
            <div
              className={clsx(
                'rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center',
                !embedded && 'rounded-3xl'
              )}
            >
              <p className="text-xs text-slate-500">No students in this class.</p>
            </div>
          )}
        </div>
      </div>

      {/* Progress workspace */}
      <div className={clsx('lg:col-span-9', embedded && 'lg:col-span-8')}>
        {selectedStudent ? (
          <div className={clsx('space-y-4', !embedded && 'space-y-6')}>
            <div
              className={clsx(
                'flex flex-col gap-4 border border-slate-100 bg-white md:flex-row md:items-center md:justify-between',
                embedded ? 'rounded-xl p-4 shadow-sm' : 'rounded-[2.5rem] border border-slate-100 p-8 shadow-sm'
              )}
            >
              <div className="flex items-center gap-4">
                <div
                  className={clsx(
                    'flex items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200',
                    embedded ? 'h-12 w-12' : 'h-16 w-16 rounded-[1.5rem] shadow-lg'
                  )}
                >
                  <User className={embedded ? 'h-6 w-6' : 'h-8 w-8'} />
                </div>
                <div>
                  <h2 className={clsx('font-semibold text-slate-900', embedded ? 'text-base' : 'text-2xl font-black')}>
                    {selectedStudent.name}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{selectedStudent.phone}</span>
                    {!embedded && (
                      <>
                        <span className="h-1 w-1 rounded-full bg-slate-300" />
                        <Badge variant="secondary" className="border-0 bg-indigo-50 text-[10px] font-semibold text-indigo-700">
                          Active
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size={embedded ? 'sm' : 'default'}
                className={clsx(
                  'rounded-lg border-slate-200 font-medium',
                  !embedded && 'h-14 rounded-2xl px-6 font-black'
                )}
                onClick={() => navigate(`/student/progress-report/${selectedStudent.id}`)}
              >
                <FileText className={clsx('text-indigo-600', embedded ? 'mr-2 h-4 w-4' : 'mr-2 h-5 w-5')} />
                Report
              </Button>
            </div>

            {loadingProgress ? (
              <div
                className={clsx(
                  'flex items-center justify-center border border-slate-100 bg-white',
                  embedded ? 'min-h-[220px] rounded-xl' : 'h-[40vh] rounded-[2.5rem]'
                )}
              >
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : !progressData || !progressData.days || progressData.days.length === 0 ? (
              <div
                className={clsx(
                  'flex flex-col items-center justify-center border border-dashed border-slate-200 bg-white text-center',
                  embedded ? 'min-h-[220px] rounded-xl p-6' : 'h-[40vh] rounded-[2.5rem] p-8'
                )}
              >
                <AlertCircle className={clsx('text-slate-300', embedded ? 'mb-3 h-10 w-10' : 'mb-4 h-10 w-10')} />
                <h3 className={clsx('font-semibold text-slate-900', embedded ? 'text-sm' : 'text-xl font-black')}>
                  No study plan progress
                </h3>
                <p className="mt-2 max-w-sm text-xs text-slate-500">
                  This student has not started their study plan for this class yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {progressData.days.map((day: any) => (
                  <Card
                    key={day.id}
                    className={clsx(
                      'overflow-hidden border-slate-200 shadow-sm',
                      embedded ? 'rounded-xl border' : 'rounded-[2rem] border-none'
                    )}
                  >
                    <CardHeader
                      className={clsx(
                        'flex cursor-pointer flex-row items-center justify-between transition-colors',
                        embedded ? 'p-4 hover:bg-slate-50/80' : 'p-6',
                        expandedDay === day.id ? 'bg-slate-50' : !embedded && 'bg-white hover:bg-slate-50/50'
                      )}
                      onClick={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                    >
                      <div className="flex flex-1 items-center gap-4">
                        <div
                          className={clsx(
                            'flex items-center justify-center rounded-xl',
                            embedded ? 'h-10 w-10' : 'h-12 w-12 rounded-2xl',
                            day.progress.pct === 100 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                          )}
                        >
                          <Calendar className={embedded ? 'h-5 w-5' : 'h-6 w-6'} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                              Day {day.day_number}
                            </span>
                            {day.progress.completed > 0 && day.progress.completed === day.progress.reviewed && (
                              <Badge className="border-0 bg-indigo-50 px-1.5 text-[9px] font-medium text-indigo-700">
                                Corrected
                              </Badge>
                            )}
                            {day.progress.completed > day.progress.reviewed && (
                              <Badge className="border-0 bg-amber-50 px-1.5 text-[9px] font-medium text-amber-800">
                                Pending review
                              </Badge>
                            )}
                          </div>
                          <h3 className={clsx('truncate font-medium text-slate-900', embedded ? 'text-sm' : 'text-lg font-black')}>
                            {day.scheduled_date
                              ? new Date(day.scheduled_date).toLocaleDateString(undefined, {
                                  weekday: 'long',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : `Day ${day.day_number}`}
                          </h3>
                        </div>
                        <div className="hidden items-center gap-4 border-l border-slate-100 pl-4 sm:flex">
                          <div className="text-center">
                            <p className="mb-0.5 text-[9px] font-medium uppercase text-slate-400">Score</p>
                            <p className="text-sm font-semibold text-slate-900">{day.progress.average_score}%</p>
                            <p className="text-[10px] text-slate-500">
                              {day.progress.completed}/{day.progress.total}
                            </p>
                          </div>
                          <div className="w-20">
                            <Progress
                              value={day.progress.pct}
                              className="h-1 bg-slate-100"
                              indicatorClassName={day.progress.pct === 100 ? 'bg-emerald-500' : 'bg-indigo-600'}
                            />
                          </div>
                        </div>
                      </div>
                      {expandedDay === day.id ? (
                        <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                      )}
                    </CardHeader>

                    <AnimatePresence>
                      {expandedDay === day.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-slate-100 bg-slate-50/40"
                        >
                          <div className={clsx('space-y-6', embedded ? 'p-4' : 'space-y-8 p-8')}>
                            {day.periods.map((period: any) => (
                              <div key={period.id} className="space-y-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400">
                                      <Clock className="h-3.5 w-3.5" />
                                    </div>
                                    <h4 className={clsx('font-medium text-slate-900', embedded ? 'text-sm' : 'font-black')}>
                                      {formatStudyPlanPeriodLabel(period.title, {
                                        scheduledDate: day.scheduled_date,
                                        dayNumber: day.day_number,
                                      })}
                                    </h4>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] text-slate-500">
                                      {period.progress.completed}/{period.progress.total} done
                                    </span>
                                    <div className="w-14">
                                      <Progress
                                        value={period.progress.pct}
                                        className="h-1 bg-slate-200"
                                        indicatorClassName="bg-indigo-400"
                                      />
                                    </div>
                                    {period.progress.completed > 0 && period.progress.completed === period.progress.reviewed && (
                                      <Badge className="border-0 bg-emerald-50 text-[9px] font-medium text-emerald-700">
                                        Corrected
                                      </Badge>
                                    )}
                                    {period.progress.completed > period.progress.reviewed && (
                                      <Badge className="border-0 bg-amber-50 text-[9px] font-medium text-amber-800">
                                        Pending
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                <div className={clsx('grid gap-2', embedded ? 'pl-0 sm:pl-9' : 'gap-3 pl-11')}>
                                  {period.tasks.map((task: any) => (
                                    <div
                                      key={task.id}
                                      className={clsx(
                                        'flex flex-col gap-3 border border-slate-100 bg-white transition-colors hover:border-slate-200 sm:flex-row sm:items-center sm:justify-between',
                                        embedded ? 'rounded-lg p-3' : 'rounded-2xl p-4'
                                      )}
                                    >
                                      <div className="flex min-w-0 items-center gap-3">
                                        <div
                                          className={clsx(
                                            'flex shrink-0 items-center justify-center rounded-full',
                                            embedded ? 'h-6 w-6' : 'h-6 w-6',
                                            task.submission ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'
                                          )}
                                        >
                                          {task.submission ? (
                                            <CheckCircle className="h-3.5 w-3.5" />
                                          ) : (
                                            <Clock className="h-3.5 w-3.5" />
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <p className={clsx('truncate text-slate-800', embedded ? 'text-sm font-medium' : 'text-sm font-black')}>
                                            {task.title}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                                        {task.submission && (
                                          <>
                                            {task.submission.status === 'reviewed' ? (
                                              <div className="flex items-center gap-1.5 pr-2">
                                                <span className="text-xs font-semibold text-slate-800">{task.submission.score}%</span>
                                                <BadgeCheck className="h-4 w-4 text-emerald-500" />
                                              </div>
                                            ) : (
                                              <Badge
                                                variant="outline"
                                                className="border-amber-100 bg-amber-50 text-[9px] font-medium text-amber-800"
                                              >
                                                Pending review
                                              </Badge>
                                            )}
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                                              onClick={() => navigate(`/teacher/evaluate/submission/${task.submission.id}`)}
                                            >
                                              Review
                                            </Button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            className={clsx(
              'flex flex-col items-center justify-center border border-dashed border-slate-200 bg-white text-center',
              embedded ? 'min-h-[280px] rounded-xl py-10 px-6' : 'h-[60vh] rounded-[3rem] p-8'
            )}
          >
            <TrendingUp className={clsx('text-slate-200', embedded ? 'mb-4 h-10 w-10' : 'mb-6 h-12 w-12')} />
            <h3 className={clsx('font-semibold text-slate-900', embedded ? 'text-sm' : 'text-2xl font-black')}>
              Select a student
            </h3>
            <p className="mt-2 max-w-sm text-xs text-slate-500">
              Choose someone from the list to see their plan, submissions, and grading actions.
            </p>
          </div>
        )}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <section className="space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-900">Submissions</h2>
            <p className="mt-0.5 text-xs text-slate-500">Review tasks and open evaluations without leaving home.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">{classSelect}</div>
        </header>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">{inner}</div>
      </section>
    )
  }

  return (
    <DashboardPageLayout
      title="Student Progress & Grading"
      description="Track study plan completion and evaluate student performance."
      actions={
        <div className="flex gap-3">
          {classSelect}
          <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-xl font-bold text-slate-500">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>
      }
    >
      {inner}
    </DashboardPageLayout>
  )
}
