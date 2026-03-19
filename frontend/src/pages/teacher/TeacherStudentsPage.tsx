import { useEffect, useState } from 'react'
import { Search, User, BookOpen, Clock, ChevronRight, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { InviteUserModal } from '@/components/admin/InviteUserModal'

interface Student { id: string; name: string; class_id: string }

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/teacher/students')
      .then(r => setStudents(r.data.data))
      .catch(() => toast.error('Could not load students'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <DashboardPageLayout
      title="Roster"
      description="Manage and track progress of students in your assigned classes."
      actions={
        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search students..."
              className="pl-9 h-10 border-slate-200 bg-white/50 backdrop-blur-sm focus:ring-primary/20"
            />
          </div>
          <Button className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add Student
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="border-slate-100 shadow-sm animate-pulse">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-slate-100" />
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-slate-100 rounded" />
                      <div className="h-3 w-20 bg-slate-100 rounded" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
              <User className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No students found</h3>
            <p className="text-sm text-slate-500 max-w-xs mt-2 leading-relaxed">
              Try adjusting your search or check back later.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(s => (
              <Card key={s.id} className="border-slate-200/60 shadow-sm hover:shadow-md transition-all group overflow-hidden bg-white/50 backdrop-blur-sm">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12 border-2 border-white shadow-sm ring-1 ring-slate-100 group-hover:scale-105 transition-transform duration-300">
                        <AvatarFallback className="bg-primary/5 text-primary font-black uppercase">
                          {s.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-bold text-slate-900 group-hover:text-primary transition-colors">{s.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] font-black uppercase px-1.5 py-0 border-none">
                            Class {s.class_id}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-slate-50 grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <BookOpen className="h-3 w-3" /> Lessons
                      </p>
                      <p className="text-sm font-black text-slate-900">--</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Last Active
                      </p>
                      <p className="text-sm font-black text-slate-900">Today</p>
                    </div>
                  </div>
                </CardContent>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/5 group-hover:bg-primary/20 transition-colors" />
              </Card>
            ))}
          </div>
        )}
      </div>
      <InviteUserModal 
        type="student" 
        open={addOpen} 
        onOpenChange={setAddOpen} 
        onSuccess={load} 
      />
    </DashboardPageLayout>
  )
}
