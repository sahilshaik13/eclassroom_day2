import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { User, Video, Calendar, Loader2, Search, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { StudyPlanPdfImport } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { clsx } from 'clsx'
import { StudentClassStudyPlanSection } from '@/components/student/StudentClassStudyPlanSection'
import { StudentClassMeetingsCard } from '@/components/student/StudentClassMeetingsCard'
import type { StudentPlanDay, StudentPlanTask } from '@/lib/studentStudyPlanTasks'
import { queryKeys } from '@/lib/queryKeys'
import { softRefetchStudyPlan } from '@/lib/studyPlanQueries'
import { subscribeToStudentClass, subscribeToStudyPlan } from '@/lib/realtime'
import { syncSupabaseRealtimeAuth } from '@/lib/supabaseAuth'
import { useAuthStore } from '@/stores/authStore'

interface Teacher {
  name: string
}

interface ClassItem {
  id: string
  name: string
  zoom_link?: string
  teacher: Teacher
}

export default function StudentClassesPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null)
  const { data: classes = [], isPending: loading } = useQuery({
    queryKey: queryKeys.student.classesMy(),
    queryFn: async () => {
      const res = await api.get('/student/classes/my', { timeout: 30_000 })
      return (Array.isArray(res.data?.data) ? res.data.data : []) as ClassItem[]
    },
    staleTime: 60_000,
  })

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  )

  const { data: plan = null, isPending: loadingPlan } = useQuery({
    queryKey: ['student', 'classes', selectedClassId, 'study-plan'],
    enabled: !!selectedClassId,
    queryFn: async () => {
      const res = await api.get(`/student/classes/${selectedClassId}/study-plan`, { timeout: 60_000 })
      return res.data?.data ?? null
    },
    staleTime: 60_000,
  })

  const { data: planSource = null } = useQuery({
    queryKey: ['student', 'classes', selectedClassId, 'study-plan-source'],
    enabled: !!selectedClassId,
    queryFn: async () => {
      const res = await api
        .get(`/student/classes/${selectedClassId}/study-plan-source`, { timeout: 60_000 })
        .catch(() => ({ data: { data: null } }))
      return ((res as { data?: { data?: StudyPlanPdfImport | null } }).data?.data || null) as StudyPlanPdfImport | null
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    const classIdFromUrl = searchParams.get('class')
    if (!classes.length) {
      setSelectedClassId('')
      return
    }
    const match = classIdFromUrl ? classes.find((c) => c.id === classIdFromUrl) : null
    setSelectedClassId(match?.id ?? classes[0].id)
  }, [classes, searchParams])

  // Subscribe to real-time updates when a class is selected
  const studentId = useAuthStore((s) => s.user?.id)
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? undefined)
  useEffect(() => {
    if (!selectedClassId || !studentId) return

    let cancelled = false
    let unsubClass = () => {}
    let unsubPlan = () => {}

    void syncSupabaseRealtimeAuth().then(() => {
      if (cancelled) return
      unsubClass = subscribeToStudentClass(selectedClassId, studentId)
      unsubPlan = subscribeToStudyPlan(selectedClassId, studentId, 'student', {
        planId: plan?.id,
        tenantId,
      })
    })

    return () => {
      cancelled = true
      unsubClass()
      unsubPlan()
    }
  }, [selectedClassId, studentId, plan?.id, tenantId])

  const handleToggleTask = useCallback(
    async (task: StudentPlanTask, checked: boolean, audioDataUrl?: string) => {
      if (!selectedClass) return
      setTogglingTaskId(task.id)
      try {
        if (checked && audioDataUrl) {
          await api.post(`/student/tasks/${task.id}/submit`, {
            content: {
              toggled: true,
              task_label: task.title,
              submission_mode: 'toggle_with_audio',
            },
            audio_url: audioDataUrl,
          })
          toast.success('Task submitted with audio')
        } else {
          const res = await api.patch(`/student/tasks/${task.id}/toggle`)
          const completed = !!res.data?.data?.completed
          toast.success(completed ? 'Task marked as done' : 'Task unmarked')
        }
        softRefetchStudyPlan(queryClient, ['student', 'classes', selectedClass.id, 'study-plan'])
        softRefetchStudyPlan(queryClient, queryKeys.student.tasksToday())
      } catch {
        toast.error('Could not update task')
      } finally {
        setTogglingTaskId(null)
      }
    },
    [queryClient, selectedClass],
  )

  if (loading) {
    return (
      <DashboardPageLayout title="My Learning Circles" description="Browse your enrolled classes and study plans.">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardPageLayout>
    )
  }

  return (
    <DashboardPageLayout
      title="My Learning Circles"
      description="Today's tasks, your study plan PDF, and all class work in one place."
      className="space-y-3 sm:space-y-4"
    >
      <div className="space-y-4">
        {/* Class picker — same density pattern as Progress page */}
        <div className="flex flex-col gap-2">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Enrolled classes
          </h3>
          {classes.length === 0 ? (
            <Card className="rounded-xl border border-dashed border-slate-200 bg-white shadow-sm">
              <CardContent className="flex flex-col items-center px-4 py-6 text-center">
                <Layers className="mb-2 h-8 w-8 text-slate-200" />
                <p className="text-xs font-bold text-slate-500">Not enrolled in any classes yet.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedClassId(c.id)}
                    className={clsx(
                      'h-9 max-w-[85vw] shrink-0 truncate rounded-lg px-3 text-left text-xs font-black transition-all sm:max-w-none',
                      selectedClass?.id === c.id
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'text-slate-500 hover:bg-slate-50',
                    )}
                    title={`${c.name} · ${c.teacher?.name ?? 'Teacher'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              {selectedClass && (
                <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                  <User className="h-3 w-3 shrink-0 text-slate-400" />
                  <span className="truncate">{selectedClass.teacher?.name ?? 'Teacher'}</span>
                </p>
              )}
            </>
          )}
        </div>

        {/* Study plan — aligned with Progress / Report card scale */}
        <div className="space-y-4">
          {selectedClass ? <StudentClassMeetingsCard classId={selectedClass.id} /> : null}
          {!selectedClass ? (
            <Card className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 shadow-sm">
              <CardContent className="flex flex-col items-center px-4 py-10 text-center">
                <Search className="mb-2 h-9 w-9 text-slate-200" />
                <h3 className="text-sm font-black text-slate-900">Select a class</h3>
                <p className="mt-1 max-w-xs text-xs font-semibold text-slate-500">
                  Choose a class above to view its study plan.
                </p>
              </CardContent>
            </Card>
          ) : loadingPlan ? (
            <Card className="rounded-xl border border-slate-100 bg-white shadow-sm">
              <CardContent className="flex items-center justify-center py-14">
                <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
              </CardContent>
            </Card>
          ) : !plan ? (
            <Card className="rounded-xl border border-slate-100 bg-white shadow-sm">
              <CardContent className="flex flex-col items-center px-4 py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
                  <Calendar className="h-6 w-6" />
                </div>
                <h3 className="text-base font-black text-slate-900">No study plan available</h3>
                <p className="mx-auto mt-2 max-w-sm text-xs font-semibold leading-relaxed text-slate-500">
                  The teacher hasn&apos;t assigned a structured study plan for{' '}
                  <strong className="text-slate-700">{selectedClass.name}</strong> yet.
                </p>
                {selectedClass.zoom_link && (
                  <Button
                    className="mt-5 min-h-0 h-10 gap-2 rounded-xl bg-blue-600 px-5 text-xs font-black text-white shadow-md hover:bg-blue-700"
                    onClick={() => window.open(selectedClass.zoom_link, '_blank')}
                  >
                    <Video className="h-4 w-4 shrink-0" /> Join live class
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <StudentClassStudyPlanSection
              planName={plan.name}
              planDays={plan.days as StudentPlanDay[]}
              planSource={planSource}
              zoomLink={selectedClass.zoom_link}
              onToggleTask={handleToggleTask}
              togglingTaskId={togglingTaskId}
            />
          )}
        </div>
      </div>
    </DashboardPageLayout>
  )
}
