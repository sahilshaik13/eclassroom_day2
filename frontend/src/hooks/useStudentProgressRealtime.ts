import { useEffect } from 'react'
import { subscribeToStudentProgress } from '@/lib/realtime'
import { useAuthStore } from '@/stores/authStore'

export function useStudentProgressRealtime() {
  const studentId = useAuthStore((s) => s.user?.student_id ?? s.user?.id)

  useEffect(() => {
    if (!studentId) return
    return subscribeToStudentProgress(studentId)
  }, [studentId])
}
