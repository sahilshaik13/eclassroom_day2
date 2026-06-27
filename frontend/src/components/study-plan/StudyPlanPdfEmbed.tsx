import { ExternalLink, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StudyPlanPdfEmbedProps {
  pdfUrl?: string | null
  title?: string
  filename?: string | null
  emptyMessage?: string
  className?: string
}

export function StudyPlanPdfEmbed({
  pdfUrl,
  title,
  filename,
  emptyMessage,
  className,
}: StudyPlanPdfEmbedProps) {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('teacher.studyPlan.title')
  const resolvedEmptyMessage = emptyMessage ?? t('studyPlan.noPdfYet')
  if (!pdfUrl) {
    return (
      <Card className={className ?? 'rounded-xl border border-dashed border-slate-200 bg-slate-50/60 shadow-sm'}>
        <CardContent className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <FileText className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">{resolvedEmptyMessage}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className ?? 'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm font-black text-slate-900">{resolvedTitle}</CardTitle>
          {filename ? <p className="truncate text-xs text-slate-500">{filename}</p> : null}
        </div>
        <Button variant="outline" className="h-8 shrink-0 rounded-lg text-xs font-bold" asChild>
          <a href={pdfUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {t('studyPlan.openNewTab')}
          </a>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <iframe src={pdfUrl} title={resolvedTitle} className="h-[min(72vh,720px)] w-full border-0 bg-slate-50" />
      </CardContent>
    </Card>
  )
}
