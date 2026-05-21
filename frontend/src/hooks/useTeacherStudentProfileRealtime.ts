import { useEffect } from 'react'
import { subscribeToTeacherStudentProfile } from '@/lib/realtime'
import { useAuthStore } from '@/stores/authStore'

/** Live updates for teacher student profile (attendance, task completion, report). */
export function useTeacherStudentProfileRealtime(
  studentId: string | undefined,
  enabled: boolean,
) {
  const teacherId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (!enabled || !studentId || !teacherId) return
    return subscribeToTeacherStudentProfile(studentId, teacherId)
  }, [enabled, studentId, teacherId])
}
