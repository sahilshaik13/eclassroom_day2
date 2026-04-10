import { useEffect, useState } from 'react'
import { Search, ChevronRight, Clock, User, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { clsx } from 'clsx'
import { Badge } from '@/components/ui/badge'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'

interface Student { id: string; name: string; phone?: string; class_id?: string; class_name?: string; last_checkin?: string; status?: string; classes?: { id: string; name: string }[] }
interface MyClass { id: string; name: string }
const STATUS_STYLES: Record<string, string> = { Active: 'text-emerald-700 bg-emerald-50 border-emerald-200', Struggling: 'text-amber-700 bg-amber-50 border-amber-200', Absent: 'text-red-700 bg-red-50 border-red-200', Excelling: 'text-blue-700 bg-blue-50 border-blue-200' }

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<MyClass[]>([])
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Student | null>(null)

  const load = () => { setLoading(true); api.get('/teacher/students').then(r => setStudents(r.data.data || [])).catch(() => toast.error('Could not load students')).finally(() => setLoading(false)) }

  useEffect(() => {
    load();
    api.get('/teacher/classes').then(r => setClasses(r.data.data || [])).catch(() => { });

    // Clean up URL if it has class param leftover from previous version
    const params = new URLSearchParams(window.location.search);
    if (params.get('class')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [])

  const filtered = students.filter(s => (s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone || '').includes(search)) && (classFilter === 'all' || s.class_id === classFilter))

  return (
    <DashboardPageLayout title="My Students" description="Track progress and manage your classroom."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 border-slate-200 rounded-xl hidden sm:flex" onClick={() => { const csv = ['Name,Phone,Class,Status', ...filtered.map(s => `${s.name},${s.phone || ''},${s.class_name || ''},${s.status || 'Active'}`)].join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'students.csv'; a.click(); toast.success('Exported!') }}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      }>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students..." className="pl-9 h-10 border-slate-200 rounded-xl bg-white" /></div>
        {classes.length > 1 && (<Select value={classFilter} onValueChange={setClassFilter}><SelectTrigger className="w-full sm:w-44 h-10 border-slate-200 rounded-xl bg-white"><SelectValue placeholder="All Classes" /></SelectTrigger><SelectContent><SelectItem value="all">All Classes</SelectItem>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>)}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-5 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider gap-4"><span>Student Name</span><span>ID</span><span className="hidden md:block">Last Check-In</span><span>Status</span><span></span></div>
        {loading ? ([1, 2, 3, 4].map(i => <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse"><div className="h-10 w-10 rounded-full bg-slate-100 shrink-0" /><div className="space-y-2 flex-1"><div className="h-3.5 w-32 bg-slate-100 rounded" /><div className="h-3 w-20 bg-slate-100 rounded" /></div></div>))
          : filtered.length === 0 ? (<div className="flex flex-col items-center justify-center py-20 text-center"><div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100"><User className="h-7 w-7 text-slate-300" /></div><h3 className="text-base font-bold text-slate-700">No students yet</h3><p className="text-sm text-slate-400 mt-1 max-w-xs">Ask your coordinator to assign students to your class.</p></div>)
            : (<div className="divide-y divide-slate-50">{filtered.map(s => { const status = s.status || 'Active'; const initials = s.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); return (<button key={s.id} onClick={() => setSelected(s)} className="w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-4 hover:bg-slate-50/70 transition-colors text-left group"><div className="flex items-center gap-3 min-w-0"><Avatar className="h-10 w-10 border border-slate-100 shrink-0"><AvatarFallback className="text-xs bg-blue-50 text-blue-700 font-bold">{initials}</AvatarFallback></Avatar><div className="min-w-0"><p className="text-sm font-semibold text-slate-900 truncate">{s.name}</p><div className="flex flex-wrap gap-1 mt-0.5">{(s as any).classes?.length > 0 ? (s as any).classes.map((c: any) => <Badge key={c.id} variant="secondary" className="text-[8px] px-1.5 py-0 h-3.5 bg-slate-100 text-slate-500 border-none">{c.name}</Badge>) : <p className="text-xs text-slate-400 truncate">{s.class_name || 'No class'}</p>}</div></div></div><span className="text-xs text-slate-400 font-mono">#{s.id.slice(-4).toUpperCase()}</span><span className="hidden md:flex items-center gap-1.5 text-xs text-slate-400"><Clock className="h-3.5 w-3.5" />{s.last_checkin || 'Never'}</span><span className={clsx('text-[10px] font-bold px-2.5 py-1 rounded-full border', STATUS_STYLES[status] || STATUS_STYLES['Active'])}>{status}</span><ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" /></button>) })}</div>)}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Student Details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-6 py-2">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 border-2 border-slate-100">
                  <AvatarFallback className="bg-blue-50 text-blue-700 font-bold text-lg">{selected.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selected.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {(selected as any).classes?.length > 0 ? (selected as any).classes.map((c: any) => (
                      <Badge key={c.id} variant="outline" className="text-[10px] uppercase font-bold tracking-tighter bg-blue-50 text-blue-600 border-blue-100">
                        {c.name}
                      </Badge>
                    )) : (
                      <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter bg-slate-50 text-slate-500 border-slate-200">
                        {selected.class_name || 'No class'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Last Check-In</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{selected.last_checkin || 'Never'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Phone</p>
                  <p className="text-xs font-bold text-slate-900 mt-0.5 font-mono break-all">{selected.phone || '—'}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardPageLayout>
  )
}
