import { useEffect, useState } from 'react'
import { Plus, BookOpen, Play, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { StudyPlanTemplate, StudyPlanTaskItem, ClassItem } from '@/types'

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
      .then(([t, c]) => { setTemplates(t.data.data); setClasses(c.data.data) })
      .catch(() => toast.error('Could not load plans'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const selectTemplate = async (t: StudyPlanTemplate) => {
    setSelected(t)
    const r = await api.get(`/admin/study-plans/${t.id}/tasks`)
    setTasks(r.data.data)
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
      toast.success(`Applied! ${r.data.data.tasks_assigned} tasks assigned to ${r.data.data.students} students.`)
    } catch { toast.error('Could not apply plan') }
    finally { setApplying(false) }
  }

  // Group tasks by day
  const byDay: Record<number, StudyPlanTaskItem[]> = {}
  tasks.forEach(t => { if (!byDay[t.day_number]) byDay[t.day_number] = []; byDay[t.day_number].push(t) })

  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-xl text-ink">Study Plans</h1>
        <p className="text-sm text-ink-muted mt-0.5">Create templates and apply them to classes</p>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Template list */}
        <div className="w-full lg:w-64 shrink-0 space-y-2">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Templates</p>
          {loading ? <div className="skeleton h-40 rounded-xl" /> : (
            templates.map(t => (
              <button key={t.id} onClick={() => selectTemplate(t)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all text-sm ${selected?.id === t.id ? 'bg-gold/5 border-gold/30 font-semibold text-ink' : 'bg-white border-border text-ink-muted hover:text-ink'}`}>
                <p className="font-medium truncate">{t.name}</p>
                <p className="text-xs opacity-60 mt-0.5">{t.total_days} days · {t.task_count} tasks</p>
              </button>
            ))
          )}
        </div>

        {/* Task editor */}
        {selected && (
          <div className="flex-1 min-w-0 space-y-4">
            <div className="card">
              <h2 className="font-display text-base font-semibold text-ink mb-1">{selected.name}</h2>
              <p className="text-xs text-ink-muted">{selected.total_days} days · {tasks.length} tasks</p>
            </div>

            {/* Apply to class */}
            <div className="card border-gold/20 flex items-end gap-3">
              <div className="flex-1">
                <label className="label">Apply to Class</label>
                <select value={applyClassId} onChange={e => setApplyClassId(e.target.value)} className="input">
                  <option value="">Select class…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button onClick={apply} disabled={applying} className="btn-primary shrink-0">
                {applying ? 'Applying…' : <><Play className="w-4 h-4" /> Apply</>}
              </button>
            </div>

            {/* Add task */}
            <div className="card flex gap-3 flex-wrap">
              <input type="number" min="1" value={newTask.day_number}
                onChange={e => setNewTask(p => ({...p, day_number: Number(e.target.value)}))}
                className="input w-20" placeholder="Day" />
              <input value={newTask.title}
                onChange={e => setNewTask(p => ({...p, title: e.target.value}))}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                className="input flex-1" placeholder="Task title…" />
              <select value={newTask.task_type}
                onChange={e => setNewTask(p => ({...p, task_type: e.target.value}))}
                className="input w-36">
                {['memorise','review','recite','listen','read'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={addTask} className="btn-primary">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            {/* Task list by day */}
            <div className="space-y-2">
              {Object.entries(byDay).sort(([a],[b])=>Number(a)-Number(b)).map(([day, dayTasks]) => (
                <div key={day} className="card">
                  <p className="text-xs font-bold text-ink-muted uppercase mb-2">Day {day}</p>
                  {dayTasks.map(t => (
                    <div key={t.id} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-ink">{t.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-gold text-[10px] capitalize">{t.task_type}</span>
                        <button onClick={() => deleteTask(t.id)} className="text-ink-faint hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {!selected && !loading && (
          <div className="flex-1 card flex items-center justify-center py-16 text-center">
            <div>
              <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-3" />
              <p className="text-sm text-ink-muted">Select a template to edit its tasks</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
