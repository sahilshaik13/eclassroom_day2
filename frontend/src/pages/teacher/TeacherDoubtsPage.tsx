import { useEffect, useState } from 'react'
import { MessageCircle, Send, ChevronDown, ChevronUp } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Doubt } from '@/types'

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

  if (loading) return (
    <div className="p-6 space-y-3 max-w-2xl mx-auto">
      {[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
    </div>
  )

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-xl text-ink">Doubts Inbox</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {pendingCount > 0 ? `${pendingCount} pending doubt${pendingCount > 1 ? 's' : ''}` : 'All caught up!'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-alt rounded-xl mb-4">
        {(['pending', 'all', 'resolved'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx(
              'flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors',
              tab === t ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            )}>
            {t}
            {t === 'pending' && pendingCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-600 text-[9px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-10">
          <MessageCircle className="w-7 h-7 text-ink-faint mx-auto mb-2" />
          <p className="text-sm text-ink-muted">No {tab} doubts.</p>
        </div>
      ) : (
        <div className="space-y-3 stagger">
          {filtered.map(doubt => {
            const studentName = (doubt as any).students?.name ?? 'Student'
            return (
              <div key={doubt.id} className={clsx('card', doubt.status === 'pending' && 'border-amber-100')}>
                <div
                  className="flex items-start justify-between gap-3 cursor-pointer"
                  onClick={() => setExpandId(expandId === doubt.id ? null : doubt.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-ink">{studentName}</span>
                      <span className={clsx('badge', doubt.status === 'pending' ? 'badge-amber' : 'badge-green')}>
                        {doubt.status}
                      </span>
                      <span className="text-[10px] text-ink-faint ml-auto">
                        {new Date(doubt.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-ink">{doubt.title}</p>
                    <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{doubt.body}</p>
                  </div>
                  {expandId === doubt.id
                    ? <ChevronUp className="w-4 h-4 text-ink-faint shrink-0 mt-1" />
                    : <ChevronDown className="w-4 h-4 text-ink-faint shrink-0 mt-1" />}
                </div>

                {expandId === doubt.id && (
                  <div className="mt-4 pt-4 border-t border-border animate-fade-in space-y-3">
                    <p className="text-sm text-ink">{doubt.body}</p>

                    {/* Existing responses */}
                    {doubt.responses && doubt.responses.length > 0 && (
                      <div className="space-y-2">
                        {doubt.responses.map(r => (
                          <div key={r.id} className="px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                            <p className="text-xs font-semibold text-emerald-700 mb-0.5">Your reply</p>
                            <p className="text-sm text-ink">{r.body}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply box — only for pending */}
                    {doubt.status === 'pending' && (
                      <div className="flex gap-2">
                        <textarea
                          value={replyText[doubt.id] ?? ''}
                          onChange={e => setReplyText(p => ({ ...p, [doubt.id]: e.target.value }))}
                          placeholder="Type your reply…"
                          rows={2}
                          className="input flex-1 resize-none text-sm"
                        />
                        <button
                          onClick={() => sendReply(doubt.id)}
                          disabled={sendingId === doubt.id}
                          className="btn-primary px-3 self-end"
                        >
                          {sendingId === doubt.id
                            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <Send className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
