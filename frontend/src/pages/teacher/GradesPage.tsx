import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'

interface GradeRow { student_id: string; name: string; score: number | ''; remarks: string }

export default function GradesPage() {
  const [classes, setClasses]   = useState<{id:string;name:string}[]>([])
  const [classId, setClassId]   = useState('')
  const [month, setMonth]       = useState(new Date().toISOString().slice(0,7))
  const [rows, setRows]         = useState<GradeRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    api.get('/teacher/classes').then(r => {
      setClasses(r.data.data)
      if (r.data.data.length > 0) setClassId(r.data.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!classId) return
    setLoading(true)
    api.get(`/teacher/students?class_id=${classId}`)
      .then(r => setRows(r.data.data.map((s: {id:string;name:string}) => ({ student_id: s.id, name: s.name, score: '', remarks: '' }))))
      .finally(() => setLoading(false))
  }, [classId])

  const update = (id: string, field: 'score'|'remarks', val: string) =>
    setRows(p => p.map(r => r.student_id === id ? {...r, [field]: field==='score' ? (val===''?'':Number(val)) : val} : r))

  const save = async () => {
    const valid = rows.filter(r => r.score !== '')
    if (!valid.length) return toast.error('Enter at least one score')
    setSaving(true)
    try {
      await api.post('/teacher/grades', { class_id: classId, month, grades: valid.map(r => ({ student_id: r.student_id, score: Number(r.score), remarks: r.remarks||undefined })) })
      toast.success('Grades saved!')
    } catch { toast.error('Could not save') } finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-xl text-ink">Grades</h1>
        <p className="text-sm text-ink-muted mt-0.5">Monthly grade entry</p>
      </div>
      <div className="card mb-5 flex flex-col sm:flex-row gap-4">
        <div className="flex-1"><label className="label">Class</label>
          <select value={classId} onChange={e => setClassId(e.target.value)} className="input">
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label className="label">Month</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input" /></div>
      </div>
      {loading ? <div className="skeleton h-48 rounded-2xl" /> : (
        <div className="card mb-5 space-y-3">
          {rows.map(row => (
            <div key={row.student_id} className="space-y-2 pb-3 border-b border-border last:border-0 last:pb-0">
              <p className="text-sm font-semibold text-ink">{row.name}</p>
              <div className="flex gap-3">
                <input type="number" min="0" max="100" value={row.score} onChange={e => update(row.student_id,'score',e.target.value)} placeholder="0-100" className="input w-28" />
                <input value={row.remarks} onChange={e => update(row.student_id,'remarks',e.target.value)} placeholder="Remarks" className="input flex-1" />
              </div>
            </div>
          ))}
          {!rows.length && <p className="text-sm text-ink-muted text-center py-6">Select a class.</p>}
        </div>
      )}
      {rows.length > 0 && (
        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? 'Saving…' : <><Save className="w-4 h-4" /> Save Grades</>}
        </button>
      )}
    </div>
  )
}
