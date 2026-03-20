import { useEffect, useState } from 'react'
import { Save, GraduationCap, RefreshCw, Star, AlertCircle, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface GradeRow { student_id: string; name: string; score: number | ''; remarks: string }

export default function GradesPage() {
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [classId, setClassId] = useState('')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [rows, setRows] = useState<GradeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

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
      .then(r => setRows(r.data.data.map((s: { id: string; name: string }) => ({ student_id: s.id, name: s.name, score: '', remarks: '' }))))
      .finally(() => setLoading(false))
  }, [classId])

  const update = (id: string, field: 'score' | 'remarks', val: string) =>
    setRows(p => p.map(r => r.student_id === id ? { ...r, [field]: field === 'score' ? (val === '' ? '' : Number(val)) : val } : r))

  const save = async () => {
    const valid = rows.filter(r => r.score !== '')
    if (!valid.length) return toast.error('Enter at least one score')
    setSaving(true)
    try {
      await api.post('/teacher/grades', {
        class_id: classId,
        month,
        grades: valid.map(r => ({ student_id: r.student_id, score: Number(r.score), remarks: r.remarks || undefined }))
      })
      toast.success('Grades successfully recorded')
    } catch { toast.error('Failed to save grades') } finally { setSaving(false) }
  }

  return (
    <DashboardPageLayout
      title="Assessments"
      description="Evaluate student performance and provide qualitative feedback."
      actions={
        <div className="flex items-center gap-3">
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-[180px] bg-white border-slate-200 shadow-sm h-10">
              <SelectValue placeholder="Select Class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="w-40 border-slate-200 bg-white shadow-sm h-10"
          />
        </div>
      }
    >
      <div className="space-y-6">
        <Card className="border-slate-200/60 shadow-xl shadow-slate-200/20 overflow-hidden bg-white/50 backdrop-blur-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 p-6 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-black text-slate-900">Monthly Scoresheet</CardTitle>
              <CardDescription>Enter grades (0-100) and remarks for students.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-20 w-full bg-slate-50 animate-pulse rounded-xl" />)}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                  <GraduationCap className="h-8 w-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">No active students</h3>
                <p className="text-sm text-slate-500 max-w-xs mt-2 leading-relaxed">
                  Select a class above to begin entering monthly performance data.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {rows.map((row) => (
                  <div key={row.student_id} className="p-6 hover:bg-slate-50/50 transition-all group">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-4 min-w-[200px]">
                        <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-slate-100 group-hover:scale-105 transition-transform">
                          <AvatarFallback className="bg-primary/5 text-primary font-black uppercase text-xs">
                            {row.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{row.name}</p>
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mt-0.5">Student ID: {row.student_id.slice(0, 8)}</p>
                        </div>
                      </div>

                      <div className="flex flex-1 items-center gap-4">
                        <div className="relative w-32">
                          <Star className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-primary transition-colors" />
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={row.score}
                            onChange={e => update(row.student_id, 'score', e.target.value)}
                            placeholder="Score"
                            className="pl-9 h-11 border-slate-200 focus:border-primary/50 focus:ring-primary/10 rounded-xl font-black tabular-nums"
                          />
                        </div>
                        <div className="relative flex-1">
                          <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-primary transition-colors" />
                          <Input
                            value={row.remarks}
                            onChange={e => update(row.student_id, 'remarks', e.target.value)}
                            placeholder="Feedback or observations..."
                            className="pl-9 h-11 border-slate-200 focus:border-primary/50 focus:ring-primary/10 rounded-xl font-medium"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>

          {rows.length > 0 && !loading && (
            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400 italic text-xs">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Scores are saved for the month of {new Date(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
              </div>
              <Button
                onClick={save}
                disabled={saving}
                className="gap-2 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 px-8 font-black uppercase text-xs tracking-widest h-11"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Save Grades
                  </>
                )}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </DashboardPageLayout>
  )
}
