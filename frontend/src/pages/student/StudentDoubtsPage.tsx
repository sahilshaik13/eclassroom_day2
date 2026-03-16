import { useEffect, useState } from 'react'
import { Plus, MessageCircle, X, Send, ChevronDown, ChevronUp } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import api from '@/services/api'
import type { Doubt, EnrolledClass } from '@/types'

const schema = z.object({
  title: z.string().min(3, 'Title required'),
  body: z.string().min(10, 'Please describe your doubt'),
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

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

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
      toast.success('Doubt submitted!')
      reset()
      setShowForm(false)
      load()
    } catch {
      toast.error('Could not submit doubt')
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = doubts.filter(d =>
    tab === 'all' ? true : d.status === tab
  )

  if (loading) return (
    <div className="p-6 space-y-3 max-w-2xl mx-auto">
      {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
    </div>
  )

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl text-ink">Doubts</h1>
          <p className="text-sm text-ink-muted mt-0.5">Ask your teacher a question</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary text-sm">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Ask a Doubt'}
        </button>
      </div>

      {/* Submit form */}
      {showForm && (
        <div className="card mb-6 border-gold/20 animate-fade-in">
          <h2 className="font-semibold text-sm text-ink mb-4">New Doubt</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Class</label>
              <select {...register('class_id')} className="input">
                <option value="">Select class…</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.class_id && <p className="mt-1 text-xs text-red-500">{errors.class_id.message}</p>}
            </div>
            <div>
              <label className="label">Title</label>
              <input {...register('title')} className="input" placeholder="What are you struggling with?" />
              {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>}
            </div>
            <div>
              <label className="label">Details</label>
              <textarea {...register('body')} rows={3} className="input resize-none" placeholder="Describe your doubt in detail…" />
              {errors.body && <p className="mt-1 text-xs text-red-500">{errors.body.message}</p>}
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Submitting…' : <><Send className="w-4 h-4" /> Submit Doubt</>}
            </button>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-alt rounded-xl mb-4">
        {(['all', 'pending', 'resolved'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors',
              tab === t ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            {t} {t === 'pending' && doubts.filter(d => d.status === 'pending').length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[9px]">
                {doubts.filter(d => d.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Doubts list */}
      {filtered.length === 0 ? (
        <div className="card text-center py-10">
          <MessageCircle className="w-7 h-7 text-ink-faint mx-auto mb-2" />
          <p className="text-sm text-ink-muted">No {tab === 'all' ? '' : tab} doubts.</p>
        </div>
      ) : (
        <div className="space-y-3 stagger">
          {filtered.map(doubt => (
            <div key={doubt.id} className="card">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer"
                onClick={() => setExpandId(expandId === doubt.id ? null : doubt.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={clsx(
                      'badge',
                      doubt.status === 'pending' ? 'badge-amber' : 'badge-green',
                    )}>
                      {doubt.status}
                    </span>
                    <span className="text-[10px] text-ink-faint">
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
                <div className="mt-4 pt-4 border-t border-border animate-fade-in">
                  <p className="text-sm text-ink">{doubt.body}</p>
                  {doubt.responses && doubt.responses.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {doubt.responses.map(r => (
                        <div key={r.id} className="px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                          <p className="text-xs font-semibold text-emerald-700 mb-1">
                            {r.teacher_name} replied
                          </p>
                          <p className="text-sm text-ink">{r.body}</p>
                          <p className="text-[10px] text-ink-faint mt-1">
                            {new Date(r.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-ink-faint italic">
                      Waiting for teacher response…
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
