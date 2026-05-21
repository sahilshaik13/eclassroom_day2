import type { StudentExamAnswers } from '@/components/competition/ExamQuestionStudentView'
import type { ExamQuestion } from '@/lib/competitionExam'

export type ExamDraftPhase = 'welcome' | 'exam'

export type ExamDraftSnapshot = {
  competitionId: string
  answers: StudentExamAnswers
  phase?: ExamDraftPhase
  questions?: ExamQuestion[]
  savedAt: string
}

const STORAGE_PREFIX = 'eclassroom:exam-draft:v1:'

function storageKey(competitionId: string) {
  return `${STORAGE_PREFIX}${competitionId}`
}

export function loadLocalExamDraft(competitionId: string): ExamDraftSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(competitionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ExamDraftSnapshot
    if (parsed.competitionId !== competitionId) return null
    return parsed
  } catch {
    return null
  }
}

export function saveLocalExamDraft(snapshot: ExamDraftSnapshot) {
  try {
    localStorage.setItem(storageKey(snapshot.competitionId), JSON.stringify(snapshot))
  } catch {
    // Quota exceeded (large audio/images) — ignore; server draft may still work
  }
}

export function clearLocalExamDraft(competitionId: string) {
  try {
    localStorage.removeItem(storageKey(competitionId))
  } catch {
    /* ignore */
  }
}

/** Convert API draft response list to answer map keyed by question_id. */
export function draftResponsesToAnswers(
  responses: Array<{ question_id?: string; answer?: unknown }>,
): StudentExamAnswers {
  const map: StudentExamAnswers = {}
  for (const row of responses) {
    if (row.question_id != null && row.answer !== undefined) {
      map[row.question_id] = row.answer as StudentExamAnswers[string]
    }
  }
  return map
}

export function pickNewerDraft(
  local: ExamDraftSnapshot | null,
  serverSavedAt: string | null | undefined,
  serverAnswers: StudentExamAnswers,
  serverPhase?: ExamDraftPhase | null,
): { answers: StudentExamAnswers; phase?: ExamDraftPhase } | null {
  const serverTime = serverSavedAt ? Date.parse(serverSavedAt) : 0
  const localTime = local?.savedAt ? Date.parse(local.savedAt) : 0

  if (local && localTime >= serverTime && Object.keys(local.answers).length > 0) {
    return { answers: local.answers, phase: local.phase }
  }
  if (serverAnswers && Object.keys(serverAnswers).length > 0) {
    return { answers: serverAnswers, phase: serverPhase ?? undefined }
  }
  if (local && Object.keys(local.answers).length > 0) {
    return { answers: local.answers, phase: local.phase }
  }
  return null
}
