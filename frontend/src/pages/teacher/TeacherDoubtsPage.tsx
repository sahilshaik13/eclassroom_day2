import { useTranslation } from 'react-i18next'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { TeacherDoubtsChatSection } from '@/components/teacher/TeacherDoubtsChat'

export default function TeacherDoubtsPage() {
  const { t } = useTranslation()

  return (
    <DashboardPageLayout
      title={t('teacher.doubts.title')}
      description={t('teacher.doubts.description')}
    >
      <TeacherDoubtsChatSection />
    </DashboardPageLayout>
  )
}
