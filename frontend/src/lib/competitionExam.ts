/** Per-question types for competition exams (teacher picks per block, like Google Forms). */

export type ExamQuestionType =
  | 'description'
  | 'mcq'
  | 'short_answer'
  | 'long_answer'
  | 'image_upload'
  | 'audio_upload'

export type ExamQuestionBase = {
  id: string
  type: ExamQuestionType
  prompt: string
}

export type ExamMcqQuestion = ExamQuestionBase & {
  type: 'mcq'
  options: string[]
  /** Single-select: index of correct option */
  correct_option: number
  allow_multiple: boolean
  /** Multi-select: indices of correct options */
  correct_options?: number[]
}

export type ExamShortAnswerQuestion = ExamQuestionBase & {
  type: 'short_answer'
  max_length: number
}

export type ExamLongAnswerQuestion = ExamQuestionBase & {
  type: 'long_answer'
}

export type ExamImageUploadQuestion = ExamQuestionBase & {
  type: 'image_upload'
  max_files: number
}

export type ExamAudioUploadQuestion = ExamQuestionBase & {
  type: 'audio_upload'
}

export type ExamDescriptionBlock = ExamQuestionBase & {
  type: 'description'
}

export type ExamQuestion =
  | ExamMcqQuestion
  | ExamShortAnswerQuestion
  | ExamLongAnswerQuestion
  | ExamImageUploadQuestion
  | ExamAudioUploadQuestion
  | ExamDescriptionBlock

export const EXAM_QUESTION_TYPE_OPTIONS: {
  value: ExamQuestionType
  label: string
  hint: string
}[] = [
  {
    value: 'description',
    label: 'Description',
    hint: 'Section text or instructions (no student answer).',
  },
  {
    value: 'mcq',
    label: 'MCQ',
    hint: 'Multiple choice with configurable options and single or multi-select.',
  },
  {
    value: 'short_answer',
    label: 'Short Answer',
    hint: 'Free-text with a configurable character limit.',
  },
  {
    value: 'long_answer',
    label: 'Long Answer',
    hint: 'Extended written response (multi-line).',
  },
  {
    value: 'image_upload',
    label: 'Image Upload',
    hint: 'Student uploads one or more image files.',
  },
  {
    value: 'audio_upload',
    label: 'Audio Upload',
    hint: 'Student records or uploads an audio clip.',
  },
]

export function newQuestionId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function defaultQuestion(type: ExamQuestionType = 'mcq'): ExamQuestion {
  const id = newQuestionId()
  const prompt = ''
  switch (type) {
    case 'description':
      return { id, type, prompt }
    case 'mcq':
      return {
        id,
        type,
        prompt,
        options: ['', '', '', ''],
        correct_option: 0,
        allow_multiple: false,
        correct_options: [],
      }
    case 'short_answer':
      return { id, type, prompt, max_length: 500 }
    case 'long_answer':
      return { id, type, prompt }
    case 'image_upload':
      return { id, type, prompt, max_files: 3 }
    case 'audio_upload':
      return { id, type, prompt }
    default:
      return defaultQuestion('mcq')
  }
}

/** Blocks that expect a student response (excludes description). */
export function isAnswerableQuestion(q: ExamQuestion): boolean {
  return q.type !== 'description'
}

export function isAutoGradableMcq(q: ExamQuestion): q is ExamMcqQuestion {
  return q.type === 'mcq'
}

/** Normalize legacy competition content (old mcq / hifz / khirat) into typed blocks. */
export function migrateExamContent(
  raw: unknown[] | undefined | null,
  competitionCategory?: string,
): ExamQuestion[] {
  if (!raw?.length) return []

  const first = raw[0] as Record<string, unknown>
  if (first && typeof first.type === 'string' && EXAM_QUESTION_TYPE_OPTIONS.some((o) => o.value === first.type)) {
    return raw as ExamQuestion[]
  }

  if (competitionCategory === 'mcq' || ('question' in first && 'options' in first)) {
    return (raw as { question: string; options: string[]; correct_option: number }[]).map((item) => ({
      id: newQuestionId(),
      type: 'mcq' as const,
      prompt: item.question || '',
      options: item.options?.length ? [...item.options] : ['', '', '', ''],
      correct_option: item.correct_option ?? 0,
      allow_multiple: false,
    }))
  }

  return (raw as { title?: string; text?: string; surah_ref?: string }[]).map((item) => ({
    id: newQuestionId(),
    type: 'audio_upload' as const,
    prompt: [item.title, item.surah_ref, item.text].filter(Boolean).join('\n\n') || 'Recitation',
  }))
}

export function countAnswerableQuestions(questions: ExamQuestion[]): number {
  return questions.filter(isAnswerableQuestion).length
}

export function gradeMcqAnswer(question: ExamMcqQuestion, studentAnswer: unknown): boolean {
  if (question.allow_multiple) {
    const expected = new Set(question.correct_options ?? [])
    const got = Array.isArray(studentAnswer) ? new Set(studentAnswer as number[]) : new Set<number>()
    if (expected.size !== got.size) return false
    for (const i of expected) if (!got.has(i)) return false
    return true
  }
  return studentAnswer === question.correct_option
}

export const EXAM_TYPE_DISPLAY_LABELS: Record<ExamQuestionType, string> = {
  description: 'Description',
  mcq: 'MCQ',
  short_answer: 'Short Answer',
  long_answer: 'Long Answer',
  image_upload: 'Image Upload',
  audio_upload: 'Audio Upload',
}

/** Filter key for student/admin competition lists */
export type CompetitionFilterType =
  | 'all'
  | 'mcq'
  | 'mixed'
  | 'short_answer'
  | 'long_answer'
  | 'image_upload'
  | 'audio_upload'

const DEFAULT_GROUP_NAME = 'General'

/** Description blocks start a section; following questions inherit that group name. */
export function resolveQuestionGroups(
  questions: ExamQuestion[],
): Map<string, string> {
  const map = new Map<string, string>()
  let current = DEFAULT_GROUP_NAME
  for (const q of questions) {
    if (q.type === 'description') {
      current = q.prompt.trim() || 'Section'
    } else {
      map.set(q.id, current)
    }
  }
  return map
}

/** Answerable question types used for competition type badges and filters. */
export const ANSWERABLE_EXAM_TYPES: Exclude<ExamQuestionType, 'description'>[] = [
  'mcq',
  'short_answer',
  'long_answer',
  'image_upload',
  'audio_upload',
]

export type CompetitionDisplayTag = {
  label: string
  filterType: CompetitionFilterType
  variant: CompetitionFilterType | 'empty'
}

function tagForSingleType(type: Exclude<ExamQuestionType, 'description'>): CompetitionDisplayTag {
  return {
    label: EXAM_TYPE_DISPLAY_LABELS[type],
    filterType: type,
    variant: type,
  }
}

/**
 * Admin/student badge from exam content:
 * - MCQ is the only type that uses a majority rule (>50% of answerable questions).
 * - Otherwise, tag is the type label only when every answerable question is that type.
 * - Any mix of types → "Mixed questions".
 */
export function deriveCompetitionDisplayTag(
  content: unknown[] | undefined | null,
  competitionCategory?: string,
): CompetitionDisplayTag {
  const questions = migrateExamContent(content, competitionCategory)
  const answerable = questions.filter(isAnswerableQuestion)

  if (!answerable.length) {
    return { label: 'No questions', filterType: 'mixed', variant: 'empty' }
  }

  const typeCounts: Partial<Record<ExamQuestionType, number>> = {}
  for (const q of answerable) {
    typeCounts[q.type] = (typeCounts[q.type] || 0) + 1
  }

  const mcqCount = typeCounts.mcq || 0
  if (mcqCount > answerable.length / 2) {
    return { label: 'MCQ', filterType: 'mcq', variant: 'mcq' }
  }

  const distinctTypes = Object.keys(typeCounts) as Exclude<ExamQuestionType, 'description'>[]
  if (distinctTypes.length === 1) {
    return tagForSingleType(distinctTypes[0])
  }

  return { label: 'Mixed questions', filterType: 'mixed', variant: 'mixed' }
}

export function matchesCompetitionFilter(
  tag: CompetitionDisplayTag,
  filter: CompetitionFilterType,
): boolean {
  if (filter === 'all') return true
  return tag.filterType === filter
}

/** Filter dropdown options for admin/student competition lists. */
export const COMPETITION_FILTER_OPTIONS: { value: CompetitionFilterType; label: string }[] = [
  { value: 'all', label: 'All types' },
  ...ANSWERABLE_EXAM_TYPES.map((t) => ({
    value: t as CompetitionFilterType,
    label: EXAM_TYPE_DISPLAY_LABELS[t],
  })),
  { value: 'mixed', label: 'Mixed questions' },
]
