import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '@/services/api'

export default function ReportsPage() {
  const [students, setStudents] = useState<{id:string;name:string}[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    api.get('/teacher/students').then(r => setStudents(r.data.data)).finally(() => setLoading(false))
  }, [])

  const download = async (id: string, name: string) => {
    try {
      const r = await api.get(`/teacher/reports/${id}`)
      const d = r.data.data
      const txt = [`Report: ${d.student?.name}`,`Month: ${d.month}`,`Attendance: ${d.attendance_pct}%`,`Tasks: ${d.task_completion_pct}%`,d.grade?`Score: ${d.grade.score}/100`:'Not graded',d.grade?.remarks||'',`Teacher: ${d.teacher?.name}`].join('\n')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([txt],{type:'text/plain'}))
      a.download = `report_${name.replace(/\s+/g,'_')}.txt`; a.click()
      toast.success('Downloaded!')
    } catch { toast.error('Could not generate report') }
  }

  if (loading) return <div className="p-6 space-y-2">{[1,2,3].map(i=><div key={i} className="skeleton h-14 rounded-xl"/>)}</div>

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6"><h1 className="font-display text-xl text-ink">Reports</h1><p className="text-sm text-ink-muted mt-0.5">Generate report cards</p></div>
      <div className="card divide-y divide-border">
        {students.map(s=>(
          <div key={s.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <span className="text-sm font-medium text-ink">{s.name}</span>
            <button onClick={()=>download(s.id,s.name)} className="btn-secondary text-xs py-1.5 px-3">Download</button>
          </div>
        ))}
      </div>
    </div>
  )
}
