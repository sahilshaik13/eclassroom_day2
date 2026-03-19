import { useEffect, useState } from 'react'
import { Plus, Play, Trash2, Calendar, ClipboardList, Layers, ChevronRight, LayoutGrid } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { StudyPlanTemplate, StudyPlanTaskItem, ClassItem } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function StudyPlansPage() {
  const [templates, setTemplates]   = useState<StudyPlanTemplate[]>([])
  const [selected, setSelected]     = useState<StudyPlanTemplate | null>(null)
  const [tasks, setTasks]           = useState<StudyPlanTaskItem[]>([])
  const [classes, setClasses]       = useState<ClassItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [applyClassId, setApplyClassId] = useState('')
  const [applying, setApplying]     = useState(false)
  const [newTask, setNewTask]       = useState({ day_number: 1, title: '', task_type: 'memorise' })

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

  const selectTemplate = async (t: StudyPlanTemplate) => {
    setSelected(t)
    try {
      const r = await api.get(`/admin/study-plans/${t.id}/tasks`)
      setTasks(r.data.data)
    } catch (error) {
      toast.error("Failed to load tasks")
    }
  }

  const addTask = async () => {
    if (!selected || !newTask.title) return toast.error('Title required')
    try {
      await api.post(`/admin/study-plans/${selected.id}/tasks`, newTask)
      const r = await api.get(`/admin/study-plans/${selected.id}/tasks`)
      setTasks(r.data.data)
      setNewTask(p => ({...p, title: ''}))
      toast.success('Task added')
    } catch { toast.error('Could not add task') }
  }

  const deleteTask = async (taskId: string) => {
    if (!selected) return
    try {
      await api.delete(`/admin/study-plans/${selected.id}/tasks/${taskId}`)
      setTasks(p => p.filter(t => t.id !== taskId))
    } catch { toast.error('Could not delete task') }
  }

  const apply = async () => {
    if (!selected || !applyClassId) return toast.error('Select a class')
    setApplying(true)
    try {
      const r = await api.post(`/admin/study-plans/${selected.id}/apply`, { class_id: applyClassId })
      toast.success(`Applied! ${r.data.data.tasks_assigned} tasks assigned.`)
    } catch { toast.error('Could not apply plan') }
    finally { setApplying(false) }
  }

  // Group tasks by day
  const byDay: Record<number, StudyPlanTaskItem[]> = {}
  tasks.forEach(t => { 
    if (!byDay[t.day_number]) byDay[t.day_number] = []
    byDay[t.day_number].push(t) 
  })

  return (
    <DashboardPageLayout
      title="Study Plans"
      description="Design curriculum templates and deploy them across active classrooms."
      actions={
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> New Template
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Template Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" />
              Templates
            </h3>
          </div>
          
          <div className="grid gap-2">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="h-16 w-full bg-slate-50 animate-pulse rounded-xl border border-slate-100" />
              ))
            ) : (
              templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  className={`group relative flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-300 ${
                    selected?.id === t.id 
                      ? 'bg-primary/5 border-primary/30 shadow-sm' 
                      : 'bg-white border-slate-200/60 hover:border-primary/20 hover:bg-slate-50/50'
                  }`}
                >
                  <p className={`font-bold text-sm truncate w-full ${selected?.id === t.id ? 'text-primary' : 'text-slate-900 group-hover:text-primary transition-colors'}`}>
                    {t.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 opacity-60">
                    <span className="text-[10px] flex items-center gap-1 font-medium">
                      <Calendar className="h-3 w-3" />
                      {t.total_days} Days
                    </span>
                    <span className="text-[10px] flex items-center gap-1 font-medium">
                      <ClipboardList className="h-3 w-3" />
                      {t.task_count} Tasks
                    </span>
                  </div>
                  {selected?.id === t.id && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <ChevronRight className="h-4 w-4 text-primary opacity-50" />
                    </div>
                  )}
                </button>
              ))
            )}
            {!loading && templates.length === 0 && (
              <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-500">No templates found</p>
              </div>
            )}
          </div>
        </div>

        {/* Task Editor Workspace */}
        <div className="lg:col-span-9">
          {selected ? (
            <div className="space-y-6">
              {/* Workspace Header */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white/50 backdrop-blur-sm border border-slate-200/60 p-6 rounded-2xl shadow-sm">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter bg-slate-50 text-slate-500 border-slate-200">
                      Template Editor
                    </Badge>
                  </div>
                  <h2 className="text-xl font-black text-slate-900 leading-tight">
                    {selected.name}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Duration: {selected.total_days} days
                    </span>
                    <span className="flex items-center gap-1">
                      <ClipboardList className="h-3.5 w-3.5" />
                      Total Content: {tasks.length} tasks
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-3 bg-slate-900 p-1.5 pl-4 rounded-xl shadow-inner border border-white/10">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-500 uppercase leading-none mb-0.5">Deploy to</span>
                    <select 
                      value={applyClassId} 
                      onChange={e => setApplyClassId(e.target.value)}
                      className="bg-transparent text-white text-xs font-bold border-none focus:ring-0 p-0 pr-8 min-w-[120px] cursor-pointer appearance-none"
                    >
                      <option value="" className="bg-slate-900">Select Class</option>
                      {classes.map(c => <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>)}
                    </select>
                  </div>
                  <Button 
                    onClick={apply} 
                    disabled={applying || !applyClassId} 
                    size="sm"
                    className="h-9 px-4 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                  >
                    {applying ? (
                      <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 mr-2 fill-current" />
                        Apply Plan
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Task Add Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-4 bg-white/80 rounded-xl border border-slate-200/60 shadow-sm ring-1 ring-slate-100">
                <div className="sm:col-span-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 ml-1">Day</span>
                  <Input 
                    type="number" 
                    min="1" 
                    value={newTask.day_number}
                    onChange={e => setNewTask(p => ({...p, day_number: Number(e.target.value)}))}
                    className="h-10 text-center font-bold"
                  />
                </div>
                <div className="sm:col-span-6">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 ml-1">Task Title</span>
                  <Input 
                    placeholder="Enter objective..."
                    value={newTask.title}
                    onChange={e => setNewTask(p => ({...p, title: e.target.value}))}
                    onKeyDown={e => e.key === 'Enter' && addTask()}
                    className="h-10"
                  />
                </div>
                <div className="sm:col-span-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 ml-1">Modal</span>
                  <Select 
                    value={newTask.task_type} 
                    onValueChange={v => setNewTask(p => ({...p, task_type: v}))}
                  >
                    <SelectTrigger className="h-10 font-medium capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['memorise','review','recite','listen','read'].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Button onClick={addTask} className="w-full h-10 gap-2">
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
              </div>

              {/* Day-by-Day View */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(byDay).sort(([a],[b])=>Number(a)-Number(b)).map(([day, dayTasks]) => (
                  <Card key={day} className="border-slate-200/60 bg-white/40 shadow-sm group">
                    <CardHeader className="py-3 px-5 border-b border-slate-100 bg-slate-50/50 rounded-t-xl flex flex-row items-center justify-between">
                      <Badge variant="secondary" className="bg-slate-900 text-white font-black text-[10px] rounded hover:bg-slate-800 transition-colors">
                        DAY {day}
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-slate-50">
                        {dayTasks.map(t => (
                          <div key={t.id} className="flex items-center justify-between p-4 px-5 hover:bg-slate-50/80 transition-colors">
                            <span className="text-sm font-semibold text-slate-800">{t.title}</span>
                            <div className="flex items-center gap-3">
                              <Badge 
                                variant="outline" 
                                className="text-[9px] uppercase font-bold bg-white text-slate-500 border-slate-200 px-1.5 py-0"
                              >
                                {t.task_type}
                              </Badge>
                              <button 
                                onClick={() => deleteTask(t.id)} 
                                className="text-slate-300 hover:text-red-500 transition-all p-1"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 bg-white/30 backdrop-blur-sm rounded-3xl border border-dashed border-slate-200">
              <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4 border border-slate-100 italic">
                <LayoutGrid className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Workspace Inactive</h3>
              <p className="text-sm text-slate-500 max-w-xs text-center mt-2 leading-relaxed">
                Select a template from the left panel to begin editing tasks and applying curriculum.
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardPageLayout>
  )
}
