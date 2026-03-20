import { useEffect, useState } from 'react'
import { Plus, Video, Users, MoreVertical, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import type { ClassItem } from '../../types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Badge } from '@/components/ui/badge'
import { ClassModal } from '@/components/admin/ClassModal'

export default function AdminClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/admin/classes')
      .then(c => {
        setClasses(c.data.data)
      })
      .catch(() => toast.error('Could not load data'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const actions = (
    <Button className="gap-2" onClick={() => setModalOpen(true)}>
      <Plus className="h-4 w-4" /> New Class
    </Button>
  )

  return (
    <DashboardPageLayout
      title="Class Management"
      description={`Monitor and organize ${classes.length} active learning environments.`}
      actions={actions}
    >
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 w-full bg-slate-50 animate-pulse rounded-xl border border-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map(c => (
            <Card key={c.id} className="group hover:shadow-md transition-all duration-300 border-slate-200/60 bg-white/50 backdrop-blur-sm overflow-hidden flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-1">
                  <Badge variant={c.is_active ? "default" : "secondary"} className={c.is_active ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}>
                    {c.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 group-hover:text-slate-600">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
                <CardTitle className="text-lg font-bold text-slate-900 group-hover:text-primary transition-colors">
                  {c.name}
                </CardTitle>
                <CardDescription className="flex items-center gap-1.5 mt-1 text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  {c.teacher_name || 'No teacher assigned'}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-4 flex-grow">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      <span>{c.enrollment_count} Students</span>
                    </div>
                    {c.zoom_link && (
                      <div className="flex items-center gap-2 text-primary font-medium">
                        <Video className="h-3.5 w-3.5" />
                        <span>Link Set</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-0 border-t border-slate-50 mt-auto">
                <Button variant="ghost" className="w-full justify-center text-xs text-slate-500 hover:text-primary hover:bg-primary/5 gap-2 h-9">
                  <Calendar className="h-3.5 w-3.5" />
                  View Schedule
                </Button>
              </CardFooter>
            </Card>
          ))}
          {classes.length === 0 && (
            <div className="col-span-full py-12 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <h3 className="text-slate-900 font-medium">No classes yet</h3>
              <p className="text-slate-500 text-sm mt-1">Start by creating your first class.</p>
              <Button variant="outline" className="mt-4 gap-2" onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" /> New Class
              </Button>
            </div>
          )}
        </div>
      )}
      <ClassModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={load}
      />
    </DashboardPageLayout>
  )
}
