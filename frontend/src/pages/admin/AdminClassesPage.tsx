import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Video, Users, MoreVertical, Settings, Trash2, BookOpen, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import type { ClassItem } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Badge } from '@/components/ui/badge'
import { ClassModal } from '@/components/admin/ClassModal'
import { ClassDetailsModal } from '@/components/admin/ClassDetailsModal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

export default function AdminClassesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null)

  // Rename state
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameClass, setRenameClass] = useState<ClassItem | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)

  const { data: classes = [], isPending: loading } = useQuery({
    queryKey: queryKeys.admin.classes(),
    queryFn: async () => (await api.get('/admin/classes')).data.data as ClassItem[],
  })

  const refreshClasses = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.classes() })
  }

  const actions = (
    <Button className="gap-2" onClick={() => setModalOpen(true)}>
      <Plus className="h-4 w-4" /> New Class
    </Button>
  )

  const handleDeleteClass = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to completely delete "${name}"? This will remove all student enrollments, attendance records, and data tied to it. This action cannot be undone.`)) return;
    
    try {
      await api.delete(`/admin/classes/${id}`);
      toast.success("Class deleted successfully");
      refreshClasses();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || "Failed to delete class");
    }
  }

  const openRename = (c: ClassItem) => {
    setRenameClass(c)
    setRenameName(c.name)
    setRenameOpen(true)
  }

  const handleRename = async () => {
    if (!renameClass || !renameName.trim()) return
    setRenaming(true)
    try {
      await api.patch(`/admin/classes/${renameClass.id}`, { name: renameName.trim() })
      toast.success('Class renamed successfully')
      setRenameOpen(false)
      refreshClasses()
    } catch {
      toast.error('Failed to rename class')
    } finally {
      setRenaming(false)
    }
  }

  return (
    <DashboardPageLayout
      title="Class Management"
      description={`Monitor and organize ${classes.length} active learning environments.`}
      actions={actions}
    >
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 w-full bg-slate-50 animate-pulse rounded-xl border border-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map(c => (
            <Card key={c.id} className="group hover:shadow-md transition-all duration-300 border-slate-200/60 bg-white/50 backdrop-blur-sm overflow-hidden flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-1">
                  <Badge variant={c.is_active ? "default" : "secondary"} className={c.is_active ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}>
                    {c.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 group-hover:text-slate-600">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => openRename(c)}
                        className="cursor-pointer font-medium gap-2"
                      >
                        <Pencil className="h-4 w-4" />
                        Rename Class
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleDeleteClass(c.id, c.name)}
                        className="text-red-600 focus:bg-red-50 focus:text-red-600 cursor-pointer font-medium"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Permanently
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardTitle className="text-lg font-bold text-slate-900 group-hover:text-primary transition-colors">
                  {c.name}
                </CardTitle>
                <CardDescription className="flex items-center gap-1.5 mt-1 text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  {c.teacher_name || 'No teacher assigned'}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-4 flex-grow">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      <span>{c.enrollment_count} Students</span>
                    </div>
                    {c.zoom_link && (
                      <div className="flex items-center gap-2 text-primary font-medium">
                        <Video className="h-3.5 w-3.5" />
                        <span>Link Set</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-0 border-t border-slate-50 mt-auto flex flex-col gap-1 p-3">
                <Button 
                  variant="ghost" 
                  className="w-full justify-center text-xs text-slate-500 hover:text-blue-600 hover:bg-blue-50 gap-2 h-9"
                  onClick={() => navigate(`/admin/classes/${c.id}/study-plan`)}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  View Study Plan
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-center text-xs text-slate-500 hover:text-primary hover:bg-primary/5 gap-2 h-9"
                  onClick={() => {
                    setSelectedClass(c);
                    setDetailsModalOpen(true);
                  }}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Manage Enrollments
                </Button>
              </CardFooter>
            </Card>
          ))}
          {classes.length === 0 && (
            <div className="col-span-full py-12 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <h3 className="text-slate-900 font-medium">No classes yet</h3>
              <p className="text-slate-500 text-sm mt-1">Start by creating your first class.</p>
              <Button variant="outline" className="mt-4 gap-2" onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" /> New Class
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle>Rename Class</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              value={renameName}
              onChange={e => setRenameName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              placeholder="Class name"
              className="rounded-xl"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={renaming || !renameName.trim()}
              className="rounded-xl"
            >
              {renaming ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClassModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={refreshClasses}
      />
      <ClassDetailsModal
        open={detailsModalOpen}
        onOpenChange={setDetailsModalOpen}
        classData={selectedClass}
        onUpdate={refreshClasses}
      />
    </DashboardPageLayout>
  )
}
