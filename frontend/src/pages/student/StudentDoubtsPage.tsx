import { useEffect, useState } from 'react'
import { Plus, MessageCircle, X, Send, ChevronDown, Clock, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import api from '@/services/api'
import type { Doubt, EnrolledClass } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const schema = z.object({
  title: z.string().min(3, 'Title required'),
  body: z.string().min(10, 'Please describe your doubt in detail'),
  class_id: z.string().min(1, 'Select a class'),
})
type Form = z.infer<typeof schema>

type Tab = 'all' | 'pending' | 'resolved'

export default function StudentDoubtsPage() {
  const [doubts, setDoubts]   = useState<Doubt[]>([])
  const [classes, setClasses] = useState<EnrolledClass[]>([])
  const [tab, setTab]         = useState<Tab>('all')
  const [showForm, setShowForm] = useState(false)
  const [expandId, setExpandId] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  // Watch class_id for custom select
  const selectedClassId = watch('class_id')

  const load = () => {
    Promise.all([
      api.get('/classroom/doubts'),
      api.get('/classroom/classes/my'),
    ]).then(([d, c]) => {
      setDoubts(d.data.data)
      setClasses(c.data.data)
    }).catch(() => toast.error('Could not load doubts'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const onSubmit = async (data: Form) => {
    setSubmitting(true)
    try {
      await api.post('/classroom/doubts', data)
      toast.success('Your doubt has been submitted. A teacher will respond soon!')
      reset()
      setShowForm(false)
      load()
    } catch {
      toast.error('Failed to submit doubt. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = doubts.filter(d => tab === 'all' ? true : d.status === tab)
  const pendingCount = doubts.filter(d => d.status === 'pending').length

  return (
    <DashboardPageLayout
      title="Peer Support & Doubts"
      description="Clear your concepts by asking questions directly to your instructors."
      actions={
        <div className="flex items-center gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-[300px]">
            <TabsList className="grid w-full grid-cols-3 bg-slate-100/50 p-1">
              <TabsTrigger value="all" className="text-[10px] font-black uppercase tracking-wider">All</TabsTrigger>
              <TabsTrigger value="pending" className="text-[10px] font-black uppercase tracking-wider relative">
                Pending
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] text-white font-black shadow-lg shadow-primary/20">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="resolved" className="text-[10px] font-black uppercase tracking-wider">Resolved</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button 
            onClick={() => setShowForm(!showForm)} 
            className={clsx(
              "gap-2 px-6 font-black uppercase text-[10px] tracking-widest h-10 transition-all",
              showForm ? "bg-slate-200 text-slate-600 hover:bg-slate-300 shadow-none border-none" : "bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
            )}
          >
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? 'Cancel' : 'New Doubt'}
          </Button>
        </div>
      }
    >
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Submit Form Card */}
        {showForm && (
          <Card className="border-primary/20 shadow-2xl shadow-primary/10 overflow-hidden bg-white animate-in zoom-in-95 duration-500 rounded-[2rem]">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                  <HelpCircle className="h-4 w-4" />
                </div>
                <CardTitle className="text-xl font-black text-slate-900">Share your doubt</CardTitle>
              </div>
              <CardDescription className="font-medium">Provide as much context as possible for a faster resolution.</CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Class Context</label>
                    <Select value={selectedClassId} onValueChange={(v) => setValue('class_id', v)}>
                      <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-slate-200">
                        <SelectValue placeholder="Which class is this for?" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errors.class_id && <p className="text-[10px] font-bold text-rose-500 ml-1">{errors.class_id.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Title</label>
                    <Input 
                      {...register('title')} 
                      placeholder="e.g., Struggling with rule of noon sakina" 
                      className="h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white transition-all"
                    />
                    {errors.title && <p className="text-[10px] font-bold text-rose-500 ml-1">{errors.title.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Description</label>
                  <Textarea 
                    {...register('body')} 
                    rows={4} 
                    className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white transition-all p-4 resize-none"
                    placeholder="Describe your confusion in detail... what exactly are you finding difficult?"
                  />
                  {errors.body && <p className="text-[10px] font-bold text-rose-500 ml-1">{errors.body.message}</p>}
                </div>

                <Button type="submit" disabled={submitting} className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-xs gap-3 shadow-lg shadow-primary/20 transition-all">
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Send className="h-4 w-4" /> Broadcast Doubt</>}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Doubts Feed */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 w-full bg-slate-50 animate-pulse rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-[2rem] border border-slate-100 shadow-sm">
            <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
              <MessageCircle className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No {tab !== 'all' ? tab : ''} history</h3>
            <p className="text-sm text-slate-500 max-w-xs mt-2 px-6">You haven't posted any concerns yet. Feel free to ask if anything is unclear!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((doubt) => (
              <Card 
                key={doubt.id} 
                className={clsx(
                  "border-slate-200/60 shadow-lg shadow-slate-200/20 overflow-hidden transition-all duration-300 rounded-[1.5rem] group cursor-pointer",
                  expandId === doubt.id ? "ring-2 ring-primary/20 bg-white" : "bg-white/50 hover:bg-white"
                )}
                onClick={() => setExpandId(expandId === doubt.id ? null : doubt.id)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <Badge 
                          variant="outline" 
                          className={clsx(
                            "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border-none transition-colors",
                            doubt.status === 'pending' ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
                          )}
                        >
                          {doubt.status}
                        </Badge>
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                          <Clock className="h-3 w-3" />
                          {new Date(doubt.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <h4 className="text-base font-black text-slate-900 group-hover:text-primary transition-colors leading-snug">
                        {doubt.title}
                      </h4>
                      <p className={clsx(
                        "text-sm text-slate-500 mt-2 leading-relaxed transition-all",
                        expandId !== doubt.id && "line-clamp-1"
                      )}>
                        {doubt.body}
                      </p>
                    </div>
                    <div className={clsx(
                      "h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 transition-all duration-500",
                      expandId === doubt.id ? "rotate-180 bg-primary/10 text-primary" : "group-hover:bg-slate-100"
                    )}>
                      <ChevronDown className="h-5 w-5" />
                    </div>
                  </div>

                  {expandId === doubt.id && (
                    <div className="mt-8 pt-8 border-t border-slate-100 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                      {doubt.responses && doubt.responses.length > 0 ? (
                        <div className="space-y-4">
                          <h5 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Instructor Evaluation
                          </h5>
                          {doubt.responses.map(r => (
                            <div key={r.id} className="relative p-6 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="flex items-center gap-3 mb-4">
                                <Avatar className="h-8 w-8 border-2 border-white shadow-sm ring-1 ring-slate-100">
                                  <AvatarFallback className="bg-primary/10 text-primary font-black text-[10px] uppercase">
                                    {r.teacher_name?.charAt(0) || 'T'}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-xs font-black text-slate-900">{r.teacher_name}</p>
                                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Course Instructor</p>
                                </div>
                              </div>
                              <p className="text-sm text-slate-700 leading-relaxed font-medium pl-1">
                                {r.body}
                              </p>
                              <div className="absolute top-4 right-4 opacity-5 bg-primary rounded-full p-2">
                                <AlertCircle className="h-8 w-8" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 bg-amber-50/50 rounded-2xl border border-dashed border-amber-200/50 flex flex-col items-center text-center">
                          <Clock className="h-8 w-8 text-amber-300 mb-3 animate-pulse" />
                          <p className="text-sm font-bold text-amber-700">Awaiting Feedback</p>
                          <p className="text-xs text-amber-600/70 mt-1">Our instructors typically respond within 24 hours.</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardPageLayout>
  )
}

const Loader2 = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={clsx("animate-spin", className)}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)
