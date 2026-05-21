import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import {
  subscribeToAdminCompetitions,
  subscribeToCompetitionExamStatus,
  subscribeToCompetitionGrading,
  subscribeToStudentCompetitions,
  subscribeToTeacherCompetitions,
} from '@/lib/realtime'

/** Live competition list updates on the student competitions page / dashboard. */
export function useStudentCompetitionRealtime() {
  const tenantId = useAuthStore((s) => s.user?.tenant_id)
  const studentId = useAuthStore((s) => s.user?.student_id ?? s.user?.id)

  useEffect(() => {
    if (!tenantId || !studentId) return
    return subscribeToStudentCompetitions(tenantId, studentId)
  }, [tenantId, studentId])
}

/** Live competition list + registrations on the teacher competitions page. */
export function useTeacherCompetitionRealtime() {
  const tenantId = useAuthStore((s) => s.user?.tenant_id)
  const teacherId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (!tenantId || !teacherId) return
    return subscribeToTeacherCompetitions(tenantId, teacherId)
  }, [tenantId, teacherId])
}

/** Live competition list + registrations on the admin competitions page. */
export function useAdminCompetitionRealtime() {
  const tenantId = useAuthStore((s) => s.user?.tenant_id)

  useEffect(() => {
    if (!tenantId) return
    return subscribeToAdminCompetitions(tenantId)
  }, [tenantId])
}

/**
 * Live exam start/stop for a single competition (admin toggles is_exam_active).
 * Use on student exam page and teacher setup — updates UI without polling.
 */
export function useCompetitionExamRealtime(
  competitionId: string | undefined,
  onExamActiveChange?: (active: boolean) => void,
  options?: { showToast?: boolean },
) {
  const onChangeRef = useRef(onExamActiveChange)
  onChangeRef.current = onExamActiveChange

  useEffect(() => {
    if (!competitionId) return
    return subscribeToCompetitionExamStatus(competitionId, {
      showToast: options?.showToast,
      onExamActiveChange: (active) => onChangeRef.current?.(active),
    })
  }, [competitionId, options?.showToast])
}

/** Live grading / submission updates on a single competition evaluate page. */
export function useCompetitionGradingRealtime(
  competitionId: string | undefined,
  onRefresh?: () => void,
) {
  const teacherId = useAuthStore((s) => s.user?.id)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    if (!competitionId || !teacherId) return
    return subscribeToCompetitionGrading(competitionId, teacherId, {
      onRefresh: () => onRefreshRef.current?.(),
    })
  }, [competitionId, teacherId])
}
