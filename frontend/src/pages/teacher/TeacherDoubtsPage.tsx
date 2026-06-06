import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { TeacherDoubtsChat } from '@/components/teacher/TeacherDoubtsChat'

export default function TeacherDoubtsPage() {
  return (
    <DashboardPageLayout
      title="Students Doubts"
      description="Reply to student questions with a message, voice note, or file."
    >
      <TeacherDoubtsChat variant="full" statusFilter="all" />
    </DashboardPageLayout>
  )
}
