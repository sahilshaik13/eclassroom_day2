import { useEffect } from 'react'
import { subscribeToTeacherStudentProfile } from '@/lib/realtime'
import { useAuthStore } from '@/stores/authStore'

/** Live updates for teacher student profile (attendance, task completion, report). */
export function useTeacherStudentProfileRealtime(
  studentId: string | undefined,
  enabled: boolean,
  options?: { tenantId?: string; classIds?: string[] },
) {
  const teacherId = useAuthStore((s) => s.user?.id)
  const tenantId = options?.tenantId ?? useAuthStore((s) => s.user?.tenant_id ?? undefined)
  const classIds = options?.classIds

  useEffect(() => {
    if (!enabled || !studentId || !teacherId) return
    return subscribeToTeacherStudentProfile(studentId, teacherId, {
      tenantId: tenantId ?? undefined,
      classIds,
    })
  }, [enabled, studentId, teacherId, tenantId, classIds?.join(',')])
}
