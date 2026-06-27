import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      if (res.success) toast.success(t('teacher.examSetup.saved'))
      else toast.error(t('teacher.examSetup.saveFailed'))
    } catch {
      toast.error(t('teacher.examSetup.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading && !comp) {
    return (
      <DashboardPageLayout title={t('teacher.examSetup.loading')} description="">
        <div className="py-20 text-center text-slate-400">{t('teacher.examSetup.loadingComp')}</div>
      </DashboardPageLayout>
    )
  }

  if (!comp) {
    return (
      <DashboardPageLayout title={t('teacher.examSetup.notFoundTitle')} description="">
        <div className="py-20 text-center text-slate-400">{t('teacher.examSetup.notFoundDesc')}</div>
      </DashboardPageLayout>
    )
  }

  const answerable = countAnswerableQuestions(questions)
  const examOpen = examActiveLive

  return (
    <DashboardPageLayout
      title={t('teacher.examSetup.title', { title: comp.title })}
      description={t('teacher.examSetup.description')}
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
            {t('teacher.examSetup.examForStudents')} {examOpen ? t('teacher.competitions.open') : t('teacher.competitions.closed')}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigate('/teacher/competitions')}>
            <ArrowLeft className="mr-1 h-4 w-4" /> {t('common.back')}
          </Button>
          <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? t('teacher.examSetup.saving') : t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-violet-700">
          <LayoutList className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-widest">{t('teacher.examSetup.formBuilder')}</span>
        </div>
        <span className="text-sm text-slate-400">
          {t('teacher.examSetup.blocks', { count: questions.length, answerable })}
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
          <Plus className="mr-2 h-4 w-4" /> {t('teacher.examSetup.addQuestion')}
        </Button>
      </div>
    </DashboardPageLayout>
  )
}
