import { useEffect, useState, useRef } from 'react'
import { Search, UserPlus, ChevronRight, Clock, Check, X, Loader2, User, Users, Download } from 'lucide-react'
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
interface SearchResult { id: string; name: string; phone: string; enrolled_classes: { class_id: string; class_name: string }[] }
interface MyClass { id: string; name: string }
const STATUS_STYLES: Record<string, string> = { Active: 'text-emerald-700 bg-emerald-50 border-emerald-200', Struggling: 'text-amber-700 bg-amber-50 border-amber-200', Absent: 'text-red-700 bg-red-50 border-red-200', Excelling: 'text-blue-700 bg-blue-50 border-blue-200' }

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<MyClass[]>([])
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Student | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [preSelectClassId, setPreSelectClassId] = useState('')
  const [moving, setMoving] = useState(false)
  const [moveClassId, setMoveClassId] = useState('')
  const [isMoving, setIsMoving] = useState(false)

  const load = () => { setLoading(true); api.get('/teacher/students').then(r => setStudents(r.data.data || [])).catch(() => toast.error('Could not load students')).finally(() => setLoading(false)) }
  useEffect(() => { 
    load(); 
    api.get('/teacher/classes').then(r => setClasses(r.data.data || [])).catch(() => { });
    
    // Check for class pre-selection from URL
    const params = new URLSearchParams(window.location.search);
    const clsId = params.get('class');
    if (clsId) {
      setPreSelectClassId(clsId);
      setShowAdd(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [])
  const filtered = students.filter(s => (s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone || '').includes(search)) && (classFilter === 'all' || s.class_id === classFilter))

  return (
    <DashboardPageLayout title="My Students" description="Track progress and manage your classroom."
      actions={<div className="flex gap-2"><Button variant="outline" size="sm" className="gap-2 border-slate-200 rounded-xl hidden sm:flex" onClick={() => { const csv = ['Name,Phone,Class,Status', ...filtered.map(s => `${s.name},${s.phone || ''},${s.class_name || ''},${s.status || 'Active'}`)].join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'students.csv'; a.click(); toast.success('Exported!') }}><Download className="h-4 w-4" /> Export</Button><Button size="sm" onClick={() => setShowAdd(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 rounded-xl"><UserPlus className="h-4 w-4" /> Add Student</Button></div>}>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students..." className="pl-9 h-10 border-slate-200 rounded-xl bg-white" /></div>
        {classes.length > 1 && (<Select value={classFilter} onValueChange={setClassFilter}><SelectTrigger className="w-full sm:w-44 h-10 border-slate-200 rounded-xl bg-white"><SelectValue placeholder="All Classes" /></SelectTrigger><SelectContent><SelectItem value="all">All Classes</SelectItem>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>)}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-5 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider gap-4"><span>Student Name</span><span>ID</span><span className="hidden md:block">Last Check-In</span><span>Status</span><span></span></div>
        {loading ? ([1, 2, 3, 4].map(i => <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse"><div className="h-10 w-10 rounded-full bg-slate-100 shrink-0" /><div className="space-y-2 flex-1"><div className="h-3.5 w-32 bg-slate-100 rounded" /><div className="h-3 w-20 bg-slate-100 rounded" /></div></div>))
          : filtered.length === 0 ? (<div className="flex flex-col items-center justify-center py-20 text-center"><div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100"><User className="h-7 w-7 text-slate-300" /></div><h3 className="text-base font-bold text-slate-700">No students yet</h3><p className="text-sm text-slate-400 mt-1 max-w-xs">Use "Add Student" to enroll students into your class.</p><Button onClick={() => setShowAdd(true)} className="mt-4 gap-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm" size="sm"><UserPlus className="h-4 w-4" /> Add First Student</Button></div>)
            : (<div className="divide-y divide-slate-50">{filtered.map(s => { const status = s.status || 'Active'; const initials = s.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); return (<button key={s.id} onClick={() => setSelected(s)} className="w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-4 hover:bg-slate-50/70 transition-colors text-left group"><div className="flex items-center gap-3 min-w-0"><Avatar className="h-10 w-10 border border-slate-100 shrink-0"><AvatarFallback className="text-xs bg-blue-50 text-blue-700 font-bold">{initials}</AvatarFallback></Avatar><div className="min-w-0"><p className="text-sm font-semibold text-slate-900 truncate">{s.name}</p><div className="flex flex-wrap gap-1 mt-0.5">{(s as any).classes?.length > 0 ? (s as any).classes.map((c: any) => <Badge key={c.id} variant="secondary" className="text-[8px] px-1.5 py-0 h-3.5 bg-slate-100 text-slate-500 border-none">{c.name}</Badge>) : <p className="text-xs text-slate-400 truncate">{s.class_name || 'No class'}</p>}</div></div></div><span className="text-xs text-slate-400 font-mono">#{s.id.slice(-4).toUpperCase()}</span><span className="hidden md:flex items-center gap-1.5 text-xs text-slate-400"><Clock className="h-3.5 w-3.5" />{s.last_checkin || 'Never'}</span><span className={clsx('text-[10px] font-bold px-2.5 py-1 rounded-full border', STATUS_STYLES[status] || STATUS_STYLES['Active'])}>{status}</span><ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" /></button>) })}</div>)}
      </div>
      <AddStudentDialog 
        open={showAdd} 
        onClose={() => { setShowAdd(false); setPreSelectClassId('') }} 
        classes={classes} 
        initialClassId={preSelectClassId}
        onAdded={() => { setShowAdd(false); setPreSelectClassId(''); load(); toast.success('Student enrolled successfully!') }} 
      />
      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setMoving(false) }}>
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

              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Management</p>
                {!moving ? (
                  <Button variant="outline" className="w-full gap-2 rounded-xl text-slate-600 border-slate-200" onClick={() => { setMoveClassId(''); setMoving(true) }}>
                    <UserPlus className="h-4 w-4" /> Enroll in Another Class
                  </Button>
                ) : (
                  <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Select Class:</label>
                    <Select value={moveClassId} onValueChange={setMoveClassId}>
                      <SelectTrigger className="h-10 border-slate-200 bg-white rounded-lg">
                        <SelectValue placeholder="Select Class">
                          {classes.find(c => c.id === moveClassId)?.name}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1 h-9 rounded-lg text-xs" onClick={() => setMoving(false)}>Cancel</Button>
                      <Button 
                        disabled={!moveClassId || isMoving} 
                        className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs gap-1.5"
                        onClick={async () => {
                          setIsMoving(true);
                          try {
                            await api.post('/teacher/students/enroll', { student_id: selected.id, class_id: moveClassId });
                            toast.success(`Enrolled ${selected.name.split(' ')[0]} in ${classes.find(c => c.id === moveClassId)?.name}`);
                            load();
                            setSelected(null);
                          } catch (e: any) {
                            toast.error(e?.response?.data?.error?.message || 'Failed to enroll student');
                          } finally {
                            setIsMoving(false);
                            setMoving(false);
                          }
                        }}
                      >
                        {isMoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3" /> Confirm Enrollment</>}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardPageLayout>
  )
}

function AddStudentDialog({ open, onClose, classes, onAdded, initialClassId }: { open: boolean; onClose: () => void; classes: MyClass[]; onAdded: () => void; initialClassId?: string }) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<SearchResult[]>([]); const [searching, setSearching] = useState(false); const [sel, setSel] = useState<SearchResult | null>(null); const [classId, setClassId] = useState(''); const [enrolling, setEnrolling] = useState(false); const ref = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { if (open) { setQuery(''); setResults([]); setSel(null); setClassId(initialClassId || classes[0]?.id || '') } }, [open, classes, initialClassId])
  useEffect(() => { if (ref.current) clearTimeout(ref.current); if (query.trim().length < 2) { setResults([]); return }; ref.current = setTimeout(async () => { setSearching(true); try { const r = await api.post('/teacher/students/search', { query: query.trim() }); setResults(r.data.data || []) } catch { toast.error('Search failed') } finally { setSearching(false) } }, 400) }, [query])
  const enroll = async () => { if (!sel || !classId) return; setEnrolling(true); try { await api.post('/teacher/students/enroll', { student_id: sel.id, class_id: classId }); onAdded() } catch (e: any) { toast.error(e?.response?.data?.error?.message || 'Could not add student') } finally { setEnrolling(false) } }
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-blue-600" /> Add Student to Your Class</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          {!sel && (<div className="space-y-2"><label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Search by Name or Phone Number</label><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input value={query} onChange={e => { setQuery(e.target.value); setSel(null) }} placeholder="e.g. Omar Hassan or +971501234567" className="pl-9 h-11 border-slate-200 rounded-xl" autoFocus />{searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />}</div></div>)}
          {results.length > 0 && !sel && (<div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto">{results.map(r => (<button key={r.id} onClick={() => setSel(r)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50/50 text-left transition-colors group"><Avatar className="h-9 w-9 border border-slate-100 shrink-0"><AvatarFallback className="text-xs bg-blue-50 text-blue-700 font-bold">{r.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-900">{r.name}</p><p className="text-xs text-slate-400 font-mono">{r.phone}</p>{r.enrolled_classes.length > 0 && <p className="text-[10px] text-slate-400 mt-0.5">In: {r.enrolled_classes.map(c => c.class_name).join(', ')}</p>}</div><ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500" /></button>))}</div>)}
          {query.length >= 2 && !searching && results.length === 0 && !sel && (<div className="flex flex-col items-center py-6 text-center bg-slate-50 rounded-xl border border-slate-100"><Users className="h-8 w-8 text-slate-300 mb-2" /><p className="text-sm font-semibold text-slate-600">No students found</p><p className="text-xs text-slate-400 mt-1">Ask admin to add the student to the center first.</p></div>)}
          {sel && (<div className="space-y-4">
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl p-3"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">{sel.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div><div><p className="text-sm font-bold text-slate-900">{sel.name}</p><p className="text-xs text-slate-500 font-mono">{sel.phone}</p></div></div><button onClick={() => { setSel(null); setResults([]) }} className="text-slate-400 hover:text-slate-700 p-1"><X className="h-4 w-4" /></button></div>
            <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add to Class</label>{classes.length === 0 ? (<p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100">You don't have any classes yet. Ask admin to assign you to a class first.</p>) : (<Select value={classId} onValueChange={setClassId}><SelectTrigger className="h-11 border-slate-200 rounded-xl"><SelectValue placeholder="Select your class" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{sel.enrolled_classes.some(e => e.class_id === c.id) ? ' ✓ Already enrolled' : ''}</SelectItem>)}</SelectContent></Select>)}</div>
            <Button onClick={enroll} disabled={enrolling || !classId || classes.length === 0} className="w-full h-11 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold gap-2">{enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Add {sel.name.split(' ')[0]} to Class</>}</Button>
          </div>)}
        </div></DialogContent>
    </Dialog>
  )
}
