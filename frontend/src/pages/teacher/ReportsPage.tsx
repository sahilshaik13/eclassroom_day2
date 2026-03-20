import { useEffect, useState } from 'react'
import { Search, ChevronRight, FileText, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

export default function ReportsPage() {
  const [students, setStudents] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/teacher/students')
      .then(r => setStudents(r.data.data))
      .finally(() => setLoading(false))
  }, [])

  const download = async (id: string, name: string) => {
    try {
      const r = await api.get(`/teacher/reports/${id}`)
      const d = r.data.data
      const txt = [
        `REPORT CARD: ${d.student?.name}`,
        `--------------------------------`,
        `Month: ${d.month}`,
        `Academic Year: 2024-25`,
        `--------------------------------`,
        `Attendance: ${d.attendance_pct}%`,
        `Task Completion: ${d.task_completion_pct}%`,
        `--------------------------------`,
        d.grade ? `Final Grade: ${d.grade.score}/100` : 'Grade: PENDING',
        d.grade?.remarks ? `Teacher Remarks: ${d.grade.remarks}` : '',
        `--------------------------------`,
        `Authorized Signatory: ${d.teacher?.name}`,
        `Generated on: ${new Date().toLocaleString()}`
      ].filter(Boolean).join('\n')

      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }))
      a.download = `report_${name.replace(/\s+/g, '_')}_${d.month}.txt`
      a.click()
      toast.success('Download complete')
    } catch {
      toast.error('Failed to generate report card')
    }
  }

  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <DashboardPageLayout
      title="Outcome Reports"
      description="Generate and export comprehensive performance reports for your students."
      actions={
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search students..."
            className="pl-9 h-10 border-slate-200 bg-white shadow-sm focus:ring-primary/10"
          />
        </div>
      }
    >
      <div className="space-y-6">
        <Card className="border-slate-200/60 shadow-xl shadow-slate-200/20 overflow-hidden bg-white/50 backdrop-blur-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30 p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-black text-slate-900">Student Directory</CardTitle>
                <CardDescription>Select a student to generate their latest academic report.</CardDescription>
              </div>
              {!loading && (
                <Badge variant="outline" className="bg-white text-slate-500 border-slate-200 uppercase text-[10px] font-black">
                  {filtered.length} Students Listed
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-4">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-16 w-full bg-slate-50 animate-pulse rounded-xl" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                  <FileText className="h-8 w-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">No records found</h3>
                <p className="text-sm text-slate-500 max-w-xs mt-2 leading-relaxed">
                  We couldn't find any students matching your current search criteria.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filtered.map((s) => (
                  <div key={s.id} className="group flex items-center gap-4 p-4 px-6 hover:bg-slate-50/80 transition-all">
                    <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-slate-100 group-hover:scale-105 transition-transform duration-300">
                      <AvatarFallback className="bg-primary/5 text-primary font-black uppercase text-xs">
                        {s.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">{s.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 text-[9px] font-black uppercase px-1.5 py-0 border-none">
                          Active Learner
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => download(s.id, s.name)}
                        className="h-9 px-4 gap-2 border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs shadow-sm hover:shadow-md transition-all active:scale-95"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Download PDF</span>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
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
