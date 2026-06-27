import { useTranslation } from 'react-i18next'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { StudentDoubtsChatSection } from '@/components/student/StudentDoubtsChat'

export default function StudentDoubtsPage() {
  const { t } = useTranslation()

  return (
    <DashboardPageLayout
      title={t('student.doubts.title')}
      description={t('student.doubts.description')}
    >
      <StudentDoubtsChatSection />
    </DashboardPageLayout>
  )
}
