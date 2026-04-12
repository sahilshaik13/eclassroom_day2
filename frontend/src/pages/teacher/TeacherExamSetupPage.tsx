import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Save, BookOpen, Mic } from 'lucide-react'
import toast from 'react-hot-toast'
import { competitionApi } from '@/services/competitionApi'
import type { Competition } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface MCQQuestion {
  question: string
  options: string[]
  correct_option: number // index 0-3
}

interface Passage {
  title: string
  text: string // Arabic text / Surah reference
  surah_ref?: string
}

export default function TeacherExamSetupPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [comp, setComp] = useState<Competition | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // MCQ state
  const [questions, setQuestions] = useState<MCQQuestion[]>([])

  // Passage state (Hifz/Khirat)
  const [passages, setPassages] = useState<Passage[]>([])

  useEffect(() => {
    if (!id) return
    competitionApi.getCompetitionInfo(id)
      .then(r => {
        if (r.success) {
          setComp(r.data)
          // Hydrate existing content
          if (r.data.content && r.data.content.length > 0) {
            if (r.data.category === 'mcq') {
              setQuestions(r.data.content as MCQQuestion[])
            } else {
              setPassages(r.data.content as Passage[])
            }
          }
        }
      })
      .catch(() => toast.error('Failed to load competition'))
      .finally(() => setLoading(false))
  }, [id])

  // ── MCQ helpers ──
  const addQuestion = () => {
    setQuestions([...questions, { question: '', options: ['', '', '', ''], correct_option: 0 }])
  }

  const updateQuestion = (idx: number, field: string, value: any) => {
    const updated = [...questions]
    if (field === 'question') updated[idx].question = value
    else if (field === 'correct_option') updated[idx].correct_option = parseInt(value)
    setQuestions(updated)
  }

  const updateOption = (qIdx: number, oIdx: number, value: string) => {
    const updated = [...questions]
    updated[qIdx].options[oIdx] = value
    setQuestions(updated)
  }

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx))
  }

  // ── Passage helpers ──
  const addPassage = () => {
    setPassages([...passages, { title: '', text: '', surah_ref: '' }])
  }

  const updatePassage = (idx: number, field: keyof Passage, value: string) => {
    const updated = [...passages]
    ;(updated[idx] as any)[field] = value
    setPassages(updated)
  }

  const removePassage = (idx: number) => {
    setPassages(passages.filter((_, i) => i !== idx))
  }

  // ── Save ──
  const handleSave = async () => {
    if (!id || !comp) return
    setSaving(true)
    try {
      const content = comp.category === 'mcq' ? questions : passages
      // Validate
      if (content.length === 0) {
        toast.error('Please add at least one item')
        setSaving(false)
        return
      }

      const res = await competitionApi.saveTeacherContent(id, content)
      if (res.success) {
        toast.success('Exam content saved successfully!')
      } else {
        toast.error('Failed to save')
      }
    } catch (e) {
      toast.error('Failed to save content')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardPageLayout title="Loading..." description="">
        <div className="py-20 text-center text-slate-400">Loading competition details...</div>
      </DashboardPageLayout>
    )
  }

  if (!comp) {
    return (
      <DashboardPageLayout title="Not Found" description="">
        <div className="py-20 text-center text-slate-400">Competition not found.</div>
      </DashboardPageLayout>
    )
  }

  const isMCQ = comp.category === 'mcq'
  const categoryLabel = comp.category === 'mcq' ? 'MCQ' : comp.category === 'hifz' ? 'Hifz' : 'Khirat'

  return (
    <DashboardPageLayout
      title={`Setup: ${comp.title}`}
      description={`Configure ${categoryLabel} exam content for this competition.`}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/teacher/competitions')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Content'}
          </Button>
        </div>
      }
    >
      {/* Category Badge */}
      <div className="mb-6 flex items-center gap-3">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${isMCQ ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {isMCQ ? <BookOpen className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          <span className="text-xs font-black uppercase tracking-widest">{categoryLabel} Mode</span>
        </div>
        <span className="text-sm text-slate-400">
          {isMCQ ? `${questions.length} question(s)` : `${passages.length} passage(s)`}
        </span>
      </div>

      {/* ── MCQ Builder ── */}
      {isMCQ && (
        <div className="space-y-4">
          {questions.map((q, qIdx) => (
            <div key={qIdx} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 flex-1">
                  <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-black shrink-0">
                    {qIdx + 1}
                  </span>
                  <Input
                    placeholder="Enter your question..."
                    value={q.question}
                    onChange={e => updateQuestion(qIdx, 'question', e.target.value)}
                    className="flex-1 font-medium"
                  />
                </div>
                <button onClick={() => removeQuestion(qIdx)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-10">
                {q.options.map((opt, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${qIdx}`}
                      checked={q.correct_option === oIdx}
                      onChange={() => updateQuestion(qIdx, 'correct_option', oIdx)}
                      className="accent-emerald-600"
                      title="Mark as correct answer"
                    />
                    <Input
                      placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                      value={opt}
                      onChange={e => updateOption(qIdx, oIdx, e.target.value)}
                      className={q.correct_option === oIdx ? 'border-emerald-300 bg-emerald-50/50' : ''}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-3 pl-10 italic">
                Select the radio button next to the correct answer.
              </p>
            </div>
          ))}

          <Button variant="outline" className="w-full border-dashed border-2 hover:border-blue-300 hover:bg-blue-50/50 text-slate-500 hover:text-blue-600 font-bold gap-2" onClick={addQuestion}>
            <Plus className="h-4 w-4" /> Add Question
          </Button>
        </div>
      )}

      {/* ── Hifz/Khirat Passage Builder ── */}
      {!isMCQ && (
        <div className="space-y-4">
          {passages.map((p, pIdx) => (
            <div key={pIdx} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 flex-1">
                  <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-black shrink-0">
                    {pIdx + 1}
                  </span>
                  <Input
                    placeholder="Passage title (e.g. Surah Al-Fatiha, Ayah 1-7)"
                    value={p.title}
                    onChange={e => updatePassage(pIdx, 'title', e.target.value)}
                    className="flex-1 font-medium"
                  />
                </div>
                <button onClick={() => removePassage(pIdx)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="pl-10 space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider mb-1 block">Surah Reference</label>
                  <Input
                    placeholder="e.g. Al-Baqarah 2:255"
                    value={p.surah_ref || ''}
                    onChange={e => updatePassage(pIdx, 'surah_ref', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider mb-1 block">Arabic Text / Instructions</label>
                  <textarea
                    className="w-full border border-slate-200 rounded-lg p-3 sm:text-sm min-h-[100px] font-arabic text-right text-lg leading-loose focus:ring-blue-500 focus:border-blue-500"
                    dir="rtl"
                    placeholder="Paste the Arabic passage here..."
                    value={p.text}
                    onChange={e => updatePassage(pIdx, 'text', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <Button variant="outline" className="w-full border-dashed border-2 hover:border-emerald-300 hover:bg-emerald-50/50 text-slate-500 hover:text-emerald-600 font-bold gap-2" onClick={addPassage}>
            <Plus className="h-4 w-4" /> Add Passage
          </Button>
        </div>
      )}
    </DashboardPageLayout>
  )
}
