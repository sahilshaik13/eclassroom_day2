import { useEffect, useState } from 'react'
import { Send, ChevronDown, ChevronUp, Reply, Clock, AlertCircle, Inbox, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Doubt } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'

type Tab = 'pending' | 'resolved' | 'all'

export default function TeacherDoubtsPage() {
  const [doubts, setDoubts] = useState<Doubt[]>([])
  const [tab, setTab] = useState<Tab>('pending')
  const [loading, setLoading] = useState(true)
  const [expandId, setExpandId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [sendingId, setSendingId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.get('/teacher/doubts')
      .then(r => setDoubts(r.data.data))
      .catch(() => toast.error('Could not load doubts'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const sendReply = async (doubtId: string) => {
    const body = (replyText[doubtId] ?? '').trim()
    if (!body) return toast.error('Reply cannot be empty')
    setSendingId(doubtId)
    try {
      await api.post(`/teacher/doubts/${doubtId}/reply`, { body })
      toast.success('Reply sent!')
      setReplyText(p => ({ ...p, [doubtId]: '' }))
      setExpandId(null)
      load()
    } catch { toast.error('Could not send reply') }
    finally { setSendingId(null) }
  }

  const filtered = doubts.filter(d => tab === 'all' ? true : d.status === tab)
  const pendingCount = doubts.filter(d => d.status === 'pending').length

  return (
    <DashboardPageLayout
      title="Inbox"
      description={pendingCount > 0 ? `${pendingCount} concerns require your attention.` : "You're all caught up with student doubts."}
      actions={
        <Tabs value={tab} onValueChange={(v: string) => setTab(v as Tab)} className="w-[300px]">
          <TabsList className="grid w-full grid-cols-3 bg-slate-100/50 p-1">
            <TabsTrigger value="pending" className="text-[10px] font-black uppercase tracking-wider relative">
              Pending
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] font-black text-white shadow-sm ring-2 ring-white">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" className="text-[10px] font-black uppercase tracking-wider">All</TabsTrigger>
            <TabsTrigger value="resolved" className="text-[10px] font-black uppercase tracking-wider">Resolved</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="border-slate-100 shadow-sm animate-pulse">
                <CardContent className="p-6 h-24" />
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
              <Inbox className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No {tab} doubts</h3>
            <p className="text-sm text-slate-500 max-w-xs mt-2 leading-relaxed">
              When students have questions about their lessons, they'll appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filtered.map(doubt => {
              const studentName = (doubt as any).students?.name ?? 'Student'
              const isExpanded = expandId === doubt.id
              const isPending = doubt.status === 'pending'

              return (
                <Card 
                  key={doubt.id} 
                  className={clsx(
                    "border-slate-200/60 shadow-sm transition-all overflow-hidden bg-white/50 backdrop-blur-sm",
                    isPending && !isExpanded && "border-amber-200/50 bg-amber-50/5"
                  )}
                >
                  <div 
                    className="p-6 cursor-pointer group"
                    onClick={() => setExpandId(isExpanded ? null : doubt.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-slate-100 group-hover:scale-105 transition-transform">
                          <AvatarFallback className={clsx("font-black text-xs uppercase", isPending ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                            {studentName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-bold text-slate-900">{studentName}</span>
                            <Badge variant={isPending ? "destructive" : "secondary"} className={clsx("text-[10px] font-black uppercase px-2 py-0", isPending ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100")}>
                              {doubt.status}
                            </Badge>
                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 ml-auto">
                              <Clock className="h-3 w-3" />
                              {new Date(doubt.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          <h4 className="text-sm font-black text-slate-900 group-hover:text-primary transition-colors">{doubt.title}</h4>
                          {!isExpanded && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{doubt.body}</p>}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-400 group-hover:text-slate-900 group-hover:bg-slate-100 transition-all">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="mt-6 pt-6 border-t border-slate-100 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100/50">
                          <p className="text-sm text-slate-700 leading-relaxed font-medium">{doubt.body}</p>
                        </div>

                        {/* Existing responses */}
                        {doubt.responses && doubt.responses.length > 0 && (
                          <div className="space-y-3">
                            {doubt.responses.map(r => (
                              <div key={r.id} className="flex gap-3 items-start justify-end">
                                <div className="max-w-[80%] bg-emerald-50 border border-emerald-100 rounded-2xl p-4 shadow-sm">
                                  <div className="flex items-center gap-2 mb-1 text-emerald-700">
                                    <Reply className="h-3 w-3" />
                                    <span className="text-[10px] font-black uppercase">Your Reply</span>
                                  </div>
                                  <p className="text-xs text-slate-700 leading-relaxed font-medium">{r.body}</p>
                                </div>
                                <Avatar className="h-8 w-8 border border-white shadow-sm ring-1 ring-emerald-100">
                                  <AvatarFallback className="bg-emerald-500 text-white font-black text-[10px]">T</AvatarFallback>
                                </Avatar>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply box — only for pending */}
                        {isPending && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-primary">
                              <AlertCircle className="h-4 w-4" />
                              <span className="text-[10px] font-black uppercase tracking-wider">Send a resolution</span>
                            </div>
                            <div className="relative group/reply">
                              <Textarea
                                value={replyText[doubt.id] ?? ''}
                                onChange={e => setReplyText(p => ({ ...p, [doubt.id]: e.target.value }))}
                                placeholder="Provide clarity or guidance..."
                                className="min-h-[100px] border-slate-200 focus:border-primary/50 focus:ring-primary/10 transition-all rounded-xl resize-none pr-12 text-sm font-medium"
                              />
                              <Button
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  sendReply(doubt.id)
                                }}
                                disabled={sendingId === doubt.id || !(replyText[doubt.id] ?? '').trim()}
                                className="absolute bottom-3 right-3 h-10 w-10 rounded-xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                              >
                                {sendingId === doubt.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {isPending && <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-400/50" />}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </DashboardPageLayout>
  )
}
