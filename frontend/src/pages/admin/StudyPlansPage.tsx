import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Eye, Loader2, Pencil, Trash2, UploadCloud } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { AppliedStudyPlanSummary, ClassItem } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { AdminStudyPlanImportCard } from '@/components/admin/AdminStudyPlanImportCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function StudyPlansPage() {
  const navigate = useNavigate()
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [appliedPlans, setAppliedPlans] = useState<AppliedStudyPlanSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClassId, setSelectedClassId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === selectedClassId) || null,
    [classes, selectedClassId]
  )

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [classRes, planRes] = await Promise.all([
          api.get('/admin/classes'),
          api.get('/admin/applied-study-plans'),
        ])
        const rows = (classRes.data?.data || []) as ClassItem[]
        setClasses(rows)
        setAppliedPlans((planRes.data?.data || []) as AppliedStudyPlanSummary[])
        if (rows.length && !selectedClassId) setSelectedClassId(rows[0].id)
      } catch {
        toast.error('Could not load study plan data')
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [])

  const reloadAppliedPlans = async () => {
    try {
      const res = await api.get('/admin/applied-study-plans')
      setAppliedPlans((res.data?.data || []) as AppliedStudyPlanSummary[])
    } catch {
      /* ignore background refresh failure */
    }
  }

  const handleRemoveAppliedPlan = async (plan: AppliedStudyPlanSummary) => {
    if (!window.confirm(`Remove the study plan from ${plan.class.name}?`)) return
    try {
      await api.delete(`/admin/classrooms/${plan.class_id}/study-plan`)
      toast.success('Study plan removed')
      await reloadAppliedPlans()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to remove study plan')
    }
  }

  return (
    <DashboardPageLayout
      title="Study Plans"
      description="Upload a PDF study plan for one class. The class teacher and enrolled students are included automatically."
    >
      <div className="space-y-6">
        <Card className="rounded-3xl border-slate-200/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-black text-slate-900">Class Study Plan Import</CardTitle>
            <p className="text-sm text-slate-500">
              Select the class, optionally define the working date range, then upload and apply the study-plan PDF.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading classes...
              </div>
            ) : classes.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
                <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
                  <CalendarDays className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="text-base font-bold text-slate-900">No classes available</h3>
                <p className="mt-2 max-w-md text-sm text-slate-500">
                  Create a class first, then upload the study-plan PDF for that class.
                </p>
                <Button className="mt-5 rounded-xl" onClick={() => navigate('/admin/classes')}>
                  Open Classes
                </Button>
              </div>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Class</p>
                    <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                      <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white">
                        <SelectValue placeholder="Select class">
                          {selectedClass ? selectedClass.name : 'Select class'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Start date</p>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(event) => {
                        const next = event.target.value
                        setStartDate(next)
                        if (endDate && next && endDate < next) setEndDate('')
                      }}
                      className="h-11 rounded-xl border-slate-200 bg-white px-4"
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">End date (optional)</p>
                    <Input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white px-4"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedClass ? (
                    <>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                        Teacher auto-linked
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                        {selectedClass.enrollment_count} students auto-included
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                        Active class: {selectedClass.name}
                      </Badge>
                    </>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {selectedClass ? (
          <AdminStudyPlanImportCard
            classId={selectedClass.id}
            className={selectedClass.name}
            startDate={startDate}
            endDate={endDate}
            onApplied={() => { void reloadAppliedPlans() }}
          />
        ) : (
          <Card className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 shadow-sm">
            <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
                <UploadCloud className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Choose a class to begin</h3>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                Once a class is selected, the upload workspace appears and the teacher plus enrolled students are handled automatically.
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-3xl border-slate-200/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-black text-slate-900">Applied Class Study Plans</CardTitle>
            <p className="text-sm text-slate-500">
              Review the classes that already have an applied study plan and open them to view, edit, or remove.
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading applied study plans...
              </div>
            ) : appliedPlans.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
                <p className="text-sm font-semibold text-slate-600">No class study plans have been applied yet.</p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {appliedPlans.map((plan) => (
                  <div key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-black text-slate-900">{plan.class.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">{plan.name}</p>
                      </div>
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        {plan.status}
                      </Badge>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="outline">{plan.class.teacher_name || 'No teacher assigned'}</Badge>
                      <Badge variant="outline">{plan.class.enrollment_count} students</Badge>
                      {plan.source_import?.original_filename ? (
                        <Badge variant="outline">{plan.source_import.original_filename}</Badge>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="h-9 rounded-xl text-xs font-bold"
                        onClick={() => navigate(`/admin/classes/${plan.class_id}/study-plan`)}
                      >
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        View
                      </Button>
                      <Button
                        className="h-9 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800"
                        onClick={() => navigate(`/admin/classes/${plan.class_id}/study-plan`)}
                      >
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        className="h-9 rounded-xl border-rose-200 px-4 text-xs font-bold text-rose-600 hover:bg-rose-50"
                        onClick={() => { void handleRemoveAppliedPlan(plan) }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>

                    {plan.updated_at ? (
                      <p className="mt-4 text-xs text-slate-400">
                        Updated {new Date(plan.updated_at).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardPageLayout>
  )
}
