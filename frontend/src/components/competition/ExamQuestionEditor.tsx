import { Plus, Trash2, GripVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  EXAM_QUESTION_TYPE_OPTIONS,
  defaultQuestion,
  type ExamQuestion,
  type ExamQuestionType,
} from '@/lib/competitionExam'

type Props = {
  question: ExamQuestion
  index: number
  onChange: (q: ExamQuestion) => void
  onRemove: () => void
}

export function ExamQuestionEditor({ question, index, onChange, onRemove }: Props) {
  const { t } = useTranslation()
  const setType = (type: ExamQuestionType) => {
    const next = defaultQuestion(type)
    onChange({ ...next, id: question.id, prompt: question.prompt })
  }

  const typeMeta = EXAM_QUESTION_TYPE_OPTIONS.find((o) => o.value === question.type)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-600">
          {index + 1}
        </span>
        <GripVertical className="mt-2 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('studyPlan.questionType')}</label>
          <select
            className="w-full rounded-md border border-slate-200 p-2 text-sm"
            value={question.type}
            onChange={(e) => setType(e.target.value as ExamQuestionType)}
          >
            {EXAM_QUESTION_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {typeMeta && <p className="text-[10px] text-slate-500">{typeMeta.hint}</p>}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto p-2 text-slate-300 transition-colors hover:text-red-500"
          aria-label={t('studyPlan.removeQuestion')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 pl-0 sm:pl-10">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {question.type === 'description' ? t('studyPlan.descriptionText') : t('studyPlan.questionPrompt')}
          </label>
          {question.type === 'long_answer' || question.type === 'description' ? (
            <textarea
              className="min-h-[88px] w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-blue-500 focus:ring-blue-500"
              value={question.prompt}
              onChange={(e) => onChange({ ...question, prompt: e.target.value })}
              placeholder={
                question.type === 'description'
                  ? t('studyPlan.sectionPlaceholder')
                  : t('studyPlan.enterQuestion')
              }
            />
          ) : (
            <Input
              value={question.prompt}
              onChange={(e) => onChange({ ...question, prompt: e.target.value })}
              placeholder={t('studyPlan.enterQuestion')}
              className="font-medium"
            />
          )}
        </div>

        {question.type === 'mcq' && (
          <McqEditor question={question} onChange={onChange} />
        )}
        {question.type === 'short_answer' && (
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {t('studyPlan.charLimit')}
            </label>
            <Input
              type="number"
              min={1}
              max={10000}
              value={question.max_length}
              onChange={(e) =>
                onChange({
                  ...question,
                  max_length: Math.max(1, parseInt(e.target.value, 10) || 500),
                })
              }
            />
          </div>
        )}
        {question.type === 'image_upload' && (
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {t('studyPlan.maxFiles')}
            </label>
            <Input
              type="number"
              min={1}
              max={20}
              value={question.max_files}
              onChange={(e) =>
                onChange({
                  ...question,
                  max_files: Math.max(1, parseInt(e.target.value, 10) || 1),
                })
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

function McqEditor({
  question,
  onChange,
}: {
  question: Extract<ExamQuestion, { type: 'mcq' }>
  onChange: (q: ExamQuestion) => void
}) {
  const { t } = useTranslation()
  const updateOption = (oIdx: number, value: string) => {
    const options = [...question.options]
    options[oIdx] = value
    onChange({ ...question, options })
  }

  const addOption = () => onChange({ ...question, options: [...question.options, ''] })

  const removeOption = (oIdx: number) => {
    if (question.options.length <= 2) return
    const options = question.options.filter((_, i) => i !== oIdx)
    let correct_option = question.correct_option
    let correct_options = (question.correct_options ?? []).filter((i) => i !== oIdx).map((i) => (i > oIdx ? i - 1 : i))
    if (correct_option >= oIdx) correct_option = Math.max(0, correct_option - 1)
    onChange({ ...question, options, correct_option, correct_options })
  }

  const toggleMulti = () => {
    onChange({
      ...question,
      allow_multiple: !question.allow_multiple,
      correct_options: !question.allow_multiple ? [question.correct_option] : [],
    })
  }

  const toggleCorrectSingle = (oIdx: number) => onChange({ ...question, correct_option: oIdx })

  const toggleCorrectMulti = (oIdx: number) => {
    const set = new Set(question.correct_options ?? [])
    if (set.has(oIdx)) set.delete(oIdx)
    else set.add(oIdx)
    onChange({ ...question, correct_options: [...set].sort((a, b) => a - b) })
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={question.allow_multiple}
          onChange={toggleMulti}
          className="rounded border-slate-300"
        />
        {t('studyPlan.allowMultiple')}
      </label>
      <div className="space-y-2">
        {question.options.map((opt, oIdx) => (
          <div key={oIdx} className="flex items-center gap-2">
            {question.allow_multiple ? (
              <input
                type="checkbox"
                checked={(question.correct_options ?? []).includes(oIdx)}
                onChange={() => toggleCorrectMulti(oIdx)}
                className="accent-emerald-600"
                title={t('studyPlan.markCorrect')}
              />
            ) : (
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={question.correct_option === oIdx}
                onChange={() => toggleCorrectSingle(oIdx)}
                className="accent-emerald-600"
                title={t('studyPlan.markCorrect')}
              />
            )}
            <Input
              placeholder={t('studyPlan.optionLabel', { letter: String.fromCharCode(65 + oIdx) })}
              value={opt}
              onChange={(e) => updateOption(oIdx, e.target.value)}
              className={clsx(
                (!question.allow_multiple && question.correct_option === oIdx) ||
                  (question.allow_multiple && (question.correct_options ?? []).includes(oIdx))
                  ? 'border-emerald-300 bg-emerald-50/50'
                  : '',
              )}
            />
            {question.options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(oIdx)}
                className="p-1 text-slate-300 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addOption}>
        <Plus className="h-3.5 w-3.5" /> {t('studyPlan.addOption')}
      </Button>
      <p className="text-[10px] italic text-slate-400">
        {t('studyPlan.markCorrectHint')}
      </p>
    </div>
  )
}
