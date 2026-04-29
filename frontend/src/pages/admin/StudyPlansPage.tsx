import { useEffect, useState } from 'react'
import { Plus, Play, Trash2, LayoutGrid, Edit2, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import type { StudyPlanTemplate, ClassItem } from '../../types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function StudyPlansPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<StudyPlanTemplate[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [applyClassId, setApplyClassId] = useState('')
  const [applying, setApplying] = useState(false)
  const [selected, setSelected] = useState<StudyPlanTemplate | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([api.get('/admin/study-plans'), api.get('/admin/classes')])
      .then(([t, c]) => {
        setTemplates(t.data.data)
        setClasses(c.data.data)
      })
      .catch(() => toast.error('Could not load plans'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const apply = async () => {
    if (!selected || !applyClassId) return toast.error('Select a class')
    setApplying(true)
    try {
      await api.post(`/admin/study-plans/${selected.id}/apply`, { 
        class_id: applyClassId,
        name: `${selected.name} - ${classes.find(c => c.id === applyClassId)?.name}`,
        description: selected.description
      })
      toast.success(`Applied! Classroom study plan created.`)
    } catch { toast.error('Could not apply plan') }
    finally { setApplying(false) }
  }

  const deleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Are you sure you want to delete this template?")) return
    try {
      await api.delete(`/admin/study-plans/templates/${id}`)
      setTemplates(p => p.filter(t => t.id !== id))
      toast.success("Template deleted")
    } catch { toast.error("Failed to delete template") }
  }

  return (
    <DashboardPageLayout
      title="Curriculum Templates"
      description="Design structured multi-day study plans and deploy them to classrooms."
      actions={
        <Button className="gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-11 px-6 shadow-lg shadow-slate-200" onClick={() => navigate('/admin/study-plans/new')}>
          <Plus className="h-4 w-4" /> New Template
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Template List */}
        <div className="lg:col-span-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              [1, 2, 3, 4].map(i => (
                <div key={i} className="h-48 w-full bg-slate-50 animate-pulse rounded-3xl border border-slate-100" />
              ))
            ) : (
              templates.map(t => (
                <Card 
                  key={t.id} 
                  className={`group relative border-slate-200/60 rounded-3xl overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 cursor-pointer ${selected?.id === t.id ? 'ring-2 ring-blue-600 ring-offset-2' : ''}`}
                  onClick={() => setSelected(t)}
                >
                  <CardHeader className="bg-slate-50 p-6 flex flex-row items-start justify-between">
                    <div>
                      <h3 className="font-black text-lg text-slate-900 group-hover:text-blue-600 transition-colors">{t.name}</h3>
                      <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1">
                        {t.day_count || 0} Days • {t.description || 'No description'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         className="h-8 w-8 text-slate-300 hover:text-blue-600 rounded-lg"
                         onClick={(e) => { e.stopPropagation(); navigate(`/admin/study-plans/${t.id}`); }}
                       >
                         <Edit2 className="h-4 w-4" />
                       </Button>
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         className="h-8 w-8 text-slate-300 hover:text-red-500 rounded-lg"
                         onClick={(e) => deleteTemplate(t.id, e)}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 pt-0">
                    <div className="flex items-center gap-4 mt-4">
                       <div className="flex -space-x-2">
                          {[1,2,3].map(i => (
                            <div key={i} className="w-8 h-8 rounded-full bg-white border-2 border-slate-50 flex items-center justify-center text-[10px] font-bold text-slate-400">
                               D{i}
                            </div>
                          ))}
                       </div>
                       <span className="text-xs font-bold text-slate-400">Multi-period hierarchy</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          
          {!loading && templates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
              <LayoutGrid className="h-12 w-12 text-slate-200 mb-4" />
              <h3 className="text-lg font-bold text-slate-900">No Templates Yet</h3>
              <p className="text-sm text-slate-500 max-w-xs text-center mt-2 leading-relaxed">
                Start by creating a curriculum template that can be reused across multiple classrooms.
              </p>
            </div>
          )}
        </div>

        {/* Deployment Panel */}
        <div className="lg:col-span-4">
          <Card className="border-none shadow-2xl shadow-slate-200/60 rounded-3xl overflow-hidden sticky top-8">
            <CardHeader className="bg-slate-900 text-white p-8">
               <div className="flex items-center gap-3 mb-2">
                  <Play className="h-5 w-5 text-blue-400 fill-current" />
                  <span className="text-xs font-black uppercase tracking-widest text-blue-400">Deployment</span>
               </div>
               <CardTitle className="text-2xl font-black">Deploy Template</CardTitle>
               <p className="text-slate-400 text-sm mt-2">Fork a template into a specific classroom for date assignment and student tracking.</p>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
               <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Selected Template</label>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-700">
                       {selected ? selected.name : <span className="text-slate-300">No template selected</span>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Target Classroom</label>
                    <Select value={applyClassId} onValueChange={setApplyClassId}>
                      <SelectTrigger className="h-14 rounded-2xl border-slate-200 font-bold focus:ring-blue-500/20">
                        <SelectValue placeholder="Select Classroom" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-slate-200">
                        {classes.map(c => (
                          <SelectItem key={c.id} value={c.id} className="font-medium">{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
               </div>

               <Button
                 onClick={apply}
                 disabled={applying || !applyClassId || !selected}
                 className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-200 transition-transform hover:scale-[1.02] active:scale-[0.98]"
               >
                 {applying ? (
                   <Loader2 className="h-6 w-6 animate-spin" />
                 ) : (
                   "Create Classroom Plan"
                 )}
               </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardPageLayout>
  )
}
