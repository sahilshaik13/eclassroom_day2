import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { History, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { StudyPlanTeacherChange } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function formatDetails(details: Record<string, unknown> | undefined) {
  if (!details || Object.keys(details).length === 0) return '—'
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${value ?? '—'}`)
    .join(' · ')
}

type AdminStudyPlanChangesPanelProps = {
  classId: string
  className?: string
}

export function AdminStudyPlanChangesPanel({ classId, className }: AdminStudyPlanChangesPanelProps) {
  const [rows, setRows] = useState<StudyPlanTeacherChange[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await api.get('/admin/study-plan-changes', {
          params: { class_id: classId, limit: 100 },
        })
        setRows((res.data?.data || []) as StudyPlanTeacherChange[])
      } catch {
        toast.error('Could not load study plan changes')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [classId])

  return (
    <Card className="rounded-3xl border-slate-200/80 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
          <History className="h-5 w-5 text-indigo-600" />
          Study plan changes{className ? `: ${className}` : ''}
        </CardTitle>
        <p className="text-sm text-slate-500">
          Edits from the teacher or admin on the Plan tab — previous vs updated details. Admin rows are
          labeled &quot;(Admin)&quot;.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading changes…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-slate-600">
              No study plan edits recorded for this class yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-900">{row.teacher_name || 'Unknown'}</h3>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {row.created_at
                        ? format(new Date(row.created_at), 'MMM d, yyyy · h:mm a')
                        : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px] font-bold uppercase">
                      {row.entity_type}
                    </Badge>
                    {row.plan_day_number != null ? (
                      <Badge variant="outline" className="text-[10px]">
                        Day {row.plan_day_number}
                      </Badge>
                    ) : null}
                    {row.scheduled_date ? (
                      <Badge variant="outline" className="text-[10px]">
                        {row.scheduled_date.slice(0, 10)}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-rose-700">
                      Previous
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">
                      {formatDetails(row.previous_details)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                      Updated
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">
                      {formatDetails(row.new_details)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
