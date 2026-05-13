import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Loader2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { StudyPlanTemplate } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { TemplateModal } from '@/components/admin/TemplateModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function StudyPlansPage() {
  const [templates, setTemplates] = useState<StudyPlanTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/study-plans')
      setTemplates((res.data?.data || []) as StudyPlanTemplate[])
    } catch {
      toast.error('Could not load study plan templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTemplates()
  }, [])

  return (
    <DashboardPageLayout
      title="Study Plans"
      description="Create and manage reusable study-plan templates for your classes."
      actions={
        <Button className="gap-2 rounded-xl" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      }
    >
      <Card className="rounded-3xl border-slate-200/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-black text-slate-900">Template Library</CardTitle>
          <p className="text-sm text-slate-500">
            Use templates to define the day-by-day structure that admins and teachers can apply to classrooms.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
              <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
                <CalendarDays className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No templates yet</h3>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                Create your first study-plan template, then open it to add days, periods, and tasks.
              </p>
              <Button className="mt-5 gap-2 rounded-xl" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Template
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => (
                <Link
                  key={template.id}
                  to={`/admin/study-plans/${template.id}`}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-slate-900">{template.name}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                        {template.description?.trim() || 'No description yet.'}
                      </p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-500" />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{template.day_count ?? template.total_days ?? 0} days</Badge>
                    <Badge variant="outline">{template.task_count ?? template.total_tasks ?? 0} tasks</Badge>
                  </div>

                  <p className="mt-4 text-xs text-slate-400">
                    Created {template.created_at ? new Date(template.created_at).toLocaleDateString() : 'recently'}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TemplateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {
          void loadTemplates()
        }}
      />
    </DashboardPageLayout>
  )
}
