import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { StudentDoubtsChat } from '@/components/student/StudentDoubtsChat'

export default function StudentDoubtsPage() {
  return (
    <DashboardPageLayout
      title="Ask Teacher"
      description="Ask questions and read replies from your teachers."
    >
      <StudentDoubtsChat variant="full" statusFilter="all" />
    </DashboardPageLayout>
  )
}
