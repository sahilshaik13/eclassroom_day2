import { useEffect, useState, useRef } from 'react'
import { Plus, Users, Search, X, Loader2, UserMinus } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

interface ClassData {
  id: string
  name: string
  teacher_name?: string
  enrollment_count: number
}

interface EnrolledStudent {
  id: string
  name: string
  phone: string
  status: string
}

interface ClassDetailsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  classData: ClassData | null
  onUpdate: () => void
}

export function ClassDetailsModal({ open, onOpenChange, classData, onUpdate }: ClassDetailsModalProps) {
  const [students, setStudents] = useState<EnrolledStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const searchTimeout = useRef<any>(null)

  useEffect(() => {
    if (open && classData) {
      loadStudents()
      setShowAdd(false)
    } else {
      setStudents([])
      setSearchResults([])
      setSearchQuery('')
    }
  }, [open, classData])

  const loadStudents = () => {
    setLoading(true)
    api.get(`/admin/classes/${classData?.id}/students`)
      .then(res => setStudents(res.data.data || []))
      .catch(() => toast.error('Failed to load enrolled students'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!showAdd) return
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }

    searchTimeout.current = setTimeout(() => {
      setSearching(true)
      api.get(`/admin/students?search=${encodeURIComponent(searchQuery)}`)
        .then(res => {
          // Filter out students already in the class
          const existingIds = new Set(students.map(s => s.id))
          const filtered = (res.data.data.items || []).filter((s: any) => !existingIds.has(s.id))
          setSearchResults(filtered)
        })
        .catch(() => toast.error('Search failed'))
        .finally(() => setSearching(false))
    }, 400)
  }, [searchQuery, showAdd, students])

  const handleEnroll = async (studentId: string) => {
    if (!classData) return
    setActionLoading(studentId)
    try {
      await api.post(`/admin/classes/${classData.id}/enroll`, { student_ids: [studentId] })
      toast.success('Student enrolled successfully')
      setSearchQuery('')
      setSearchResults(searchResults.filter(s => s.id !== studentId))
      loadStudents()
      onUpdate()
    } catch {
      toast.error('Failed to enroll student')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUnenroll = async (studentId: string, studentName: string) => {
    if (!classData) return
    if (!window.confirm(`Remove ${studentName} from ${classData.name}?`)) return
    setActionLoading(studentId)
    try {
      await api.delete(`/admin/classes/${classData.id}/enroll/${studentId}`)
      toast.success('Student removed from class')
      loadStudents()
      onUpdate()
    } catch {
      toast.error('Failed to remove student')
    } finally {
      setActionLoading(null)
    }
  }

  if (!classData) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-white">
        <DialogHeader>
          <div className="flex justify-between items-start pr-4">
            <div>
              <DialogTitle className="text-xl font-bold">{classData.name}</DialogTitle>
              <p className="text-sm text-slate-500 mt-1">Teacher: {classData.teacher_name || 'Unassigned'}</p>
            </div>
            {!showAdd && (
              <Button onClick={() => setShowAdd(true)} className="gap-2 bg-slate-900 text-white rounded-xl">
                <Plus className="h-4 w-4" /> Add Student
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="mt-4 border-t border-slate-100 pt-4">
          {showAdd ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-emerald-500" /> Enroll New Student
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)} className="h-8 px-2 text-slate-400 hover:text-slate-700">
                  <X className="h-4 w-4" /> Cancel
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  autoFocus
                  placeholder="Search students by name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-11 rounded-xl bg-slate-50 border-slate-200"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />}
              </div>
              
              <div className="max-h-64 overflow-y-auto space-y-2 border border-slate-100 rounded-xl p-2 bg-slate-50/50">
                {searchResults.length > 0 ? searchResults.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 border border-emerald-100"><AvatarFallback className="bg-emerald-50 text-emerald-600 text-xs font-bold">{s.name.substring(0,2).toUpperCase()}</AvatarFallback></Avatar>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.phone}</p>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => handleEnroll(s.id)}
                      disabled={actionLoading === s.id}
                      className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg h-8"
                    >
                      {actionLoading === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enroll'}
                    </Button>
                  </div>
                )) : searchQuery.length >= 2 && !searching ? (
                  <div className="p-8 text-center text-slate-500 text-sm">No new students found for this search.</div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-sm">Type at least 2 characters to search.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" /> Enrolled Students ({students.length})
              </h3>
              
              {loading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
              ) : students.length > 0 ? (
                <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50 bg-white">
                  {students.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-4 hover:bg-slate-50 group transition-colors">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-slate-100">
                          <AvatarFallback className="bg-slate-100 text-slate-600 font-bold text-xs">{s.name.substring(0,2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{s.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-slate-500 font-mono">{s.phone}</p>
                            <Badge variant="outline" className={s.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 text-[9px] h-4' : 'bg-rose-50 text-rose-600 border-rose-100 text-[9px] h-4'}>
                              {s.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUnenroll(s.id, s.name)}
                        disabled={actionLoading === s.id}
                        className="h-8 w-8 text-rose-400 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                        title="Remove from class"
                      >
                        {actionLoading === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-12 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-medium text-slate-600">No students enrolled</p>
                  <p className="text-xs text-slate-400 mt-1">Enroll students to build this class.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
