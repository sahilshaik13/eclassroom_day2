import { useEffect, useState } from 'react'
import { Plus, MessageCircle, Send, Clock, CheckCircle2, HelpCircle, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Doubt, EnrolledClass } from '@/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

type Tab = 'All Doubts' | 'Pending' | 'Resolved'

export default function StudentDoubtsPage() {
  const [doubts, setDoubts] = useState<Doubt[]>([])
  const [classes, setClasses] = useState<EnrolledClass[]>([])
  const [tab, setTab] = useState<Tab>('All Doubts')
  const [showForm, setShowForm] = useState(false)
  const [expandId, setExpandId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', class_id: '' })

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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.body || !form.class_id) {
      toast.error('Please fill in all fields.')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/classroom/doubts', form)
      toast.success('Your doubt has been submitted. A teacher will respond soon!')
      setForm({ title: '', body: '', class_id: '' })
      setShowForm(false)
      load()
    } catch {
      toast.error('Failed to submit doubt. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Deduplicate by id to prevent any double-render issues
  const uniqueDoubts = doubts.filter((d, i, arr) => arr.findIndex(x => x.id === d.id) === i)

  const filtered = uniqueDoubts.filter(d => {
    if (tab === 'All Doubts') return true
    if (tab === 'Pending') return d.status === 'pending'
    return d.status === 'resolved'
  })

  const pendingCount = uniqueDoubts.filter(d => d.status === 'pending').length

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ask Teacher</h1>
          <p className="text-slate-500 text-sm mt-0.5">Ask questions and get answers from your teachers.</p>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => setShowForm(true)}
        className="w-full py-4 rounded-2xl bg-slate-900 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" /> Ask a New Doubt
      </button>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-100 pb-0">
        {(['All Doubts', 'Pending', 'Resolved'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors',
              tab === t
                ? 'text-slate-900 bg-white border border-b-white border-slate-200 -mb-px'
                : 'text-slate-400 hover:text-slate-600'
            )}
          >
            {t}
            {t === 'Pending' && pendingCount > 0 && (
              <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Doubt List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100">
          <HelpCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No doubts here</h3>
          <p className="text-sm text-slate-400 mt-1">Ask your first question to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(doubt => (
            <DoubtCard
              key={doubt.id}
              doubt={doubt}
              expanded={expandId === doubt.id}
              onToggle={() => setExpandId(expandId === doubt.id ? null : doubt.id)}
            />
          ))}
        </div>
      )}

      {/* Submit Doubt Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ask a New Doubt</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject Title</label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Tajweed rule for Nun Sakinah"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Question</label>
              <Textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Describe your doubt in detail..."
                className="min-h-[100px] resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Related Class</label>
              <Select value={form.class_id} onValueChange={v => setForm(f => ({ ...f, class_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  {classes.length === 0 && (
                    <SelectItem value="general">General Question</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="gap-2 min-w-[120px]">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Submit</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DoubtCard({ doubt, expanded, onToggle }: { doubt: Doubt; expanded: boolean; onToggle: () => void }) {
  const isPending = doubt.status === 'pending'
  const hasResponse = doubt.responses && doubt.responses.length > 0

  return (
    <div className={clsx(
      'bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-200',
      isPending ? 'border-l-4 border-l-amber-400 border-slate-200' : 'border-l-4 border-l-blue-400 border-slate-200'
    )}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <MessageCircle className="w-5 h-5 text-slate-300 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <span className={clsx(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide mr-2',
                  isPending ? 'text-amber-700 bg-amber-50' : 'text-blue-700 bg-blue-50'
                )}>
                  ● {isPending ? 'PENDING' : 'RESOLVED'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">
                {formatTime(doubt.created_at)}
              </span>
            </div>

            <h4 className="text-sm font-bold text-slate-900 mt-2 mb-1">{doubt.title}</h4>
            <p className="text-xs text-slate-500 line-clamp-2">"{doubt.body}"</p>

            {doubt.class_name && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                <Clock className="w-3 h-3" />
                <span>Assigned: {doubt.class_name}</span>
              </div>
            )}

            {hasResponse && !expanded && (
              <button
                onClick={onToggle}
                className="mt-3 text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> View Response
              </button>
            )}

            {expanded && doubt.responses?.map(r => (
              <div key={r.id} className="mt-4 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wide">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Ustadh {r.teacher_name}
                </div>
                <p className="text-sm text-slate-700">{r.body}</p>
              </div>
            ))}

            {hasResponse && expanded && (
              <button onClick={onToggle} className="mt-2 text-xs text-slate-400 hover:underline">
                Hide response
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTime(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
