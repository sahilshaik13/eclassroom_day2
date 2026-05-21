import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus, Save, LayoutList } from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { competitionApi } from '@/services/competitionApi'
import type { Competition } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import { ExamQuestionEditor } from '@/components/competition/ExamQuestionEditor'
import {
  defaultQuestion,
  migrateExamContent,
  countAnswerableQuestions,
  type ExamQuestion,
} from '@/lib/competitionExam'
import { queryKeys } from '@/lib/queryKeys'
import { competitionListQueryOptions } from '@/lib/competitionQueries'
import { useCompetitionExamRealtime } from '@/hooks/useCompetitionRealtime'

export default function TeacherExamSetupPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [examActiveLive, setExamActiveLive] = useState(false)

  const { data: comp, isLoading: loading } = useQuery({
    queryKey: queryKeys.competitions.info(id ?? ''),
    queryFn: async () => {
      const r = await competitionApi.getCompetitionInfo(id!)
      if (!r.success) throw new Error('Failed to load competition')
      return r.data as Competition
    },
    enabled: !!id,
    ...competitionListQueryOptions(),
  })

  useCompetitionExamRealtime(id, setExamActiveLive, { showToast: true })

  useEffect(() => {
    if (comp) {
      setExamActiveLive(!!comp.is_exam_active)
      setQuestions(migrateExamContent(comp.content, comp.category))
    }
  }, [comp?.id])

  const updateQuestion = (idx: number, q: ExamQuestion) => {
    const next = [...questions]
    next[idx] = q
    setQuestions(next)
  }

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx))
  }

  const addQuestion = () => {
    setQuestions([...questions, defaultQuestion()])
  }

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    try {
      const res = await competitionApi.saveTeacherContent(id, questions)
      if (res.success) toast.success('Exam saved')
      else toast.error('Failed to save')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !comp) {
    return (
      <DashboardPageLayout title="Loading…" description="">
        <div className="py-20 text-center text-slate-400">Loading competition…</div>
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

  const answerable = countAnswerableQuestions(questions)
  const examOpen = examActiveLive

  return (
    <DashboardPageLayout
      title={`Setup: ${comp.title}`}
      description="Build the exam like Google Forms — pick a type for each question."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={clsx(
              'rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wide',
              examOpen
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-500',
            )}
          >
            Exam for students: {examOpen ? 'Open' : 'Closed'}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigate('/teacher/competitions')}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      }
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-violet-700">
          <LayoutList className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-widest">Form builder</span>
        </div>
        <span className="text-sm text-slate-400">
          {questions.length} block(s) · {answerable} graded / answered
        </span>
      </div>

      <div className="space-y-4">
        {questions.map((q, idx) => (
          <ExamQuestionEditor
            key={q.id}
            index={idx}
            question={q}
            onChange={(updated) => updateQuestion(idx, updated)}
            onRemove={() => removeQuestion(idx)}
          />
        ))}
        <Button variant="outline" className="w-full border-dashed" onClick={addQuestion}>
          <Plus className="mr-2 h-4 w-4" /> Add question
        </Button>
      </div>
    </DashboardPageLayout>
  )
}
