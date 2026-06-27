import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, FileText } from 'lucide-react'
import type { StudyPlanPdfImport } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StudyPlanPdfPreviewModal } from '@/components/study-plan/StudyPlanPdfPreviewModal'
import { StudyPlanTableView } from '@/components/study-plan/StudyPlanTableView'

interface StudyPlanSourceCardProps {
  source: StudyPlanPdfImport | null
  title?: string
  description?: string
  emptyMessage?: string
}

export function StudyPlanSourceCard({
  source,
  title,
  description,
  emptyMessage,
}: StudyPlanSourceCardProps) {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('studyPlan.tableTitle')
  const resolvedDescription = description ?? t('studyPlan.tableDescription')
  const resolvedEmptyMessage = emptyMessage ?? t('studyPlan.tableEmpty')
  const [pdfOpen, setPdfOpen] = useState(false)

  const columns = useMemo(() => {
    if (!source) return []
    return source.selected_columns?.length ? source.selected_columns : source.detected_columns || []
  }, [source])

  const rows = useMemo(() => {
    if (!source) return []
    return source.applied_rows?.length
      ? source.applied_rows
      : source.filtered_rows?.length
        ? source.filtered_rows
        : source.extracted_rows || []
  }, [source])

  return (
    <>
      <Card className="rounded-3xl border-slate-200/80 shadow-sm">
        <CardHeader className="gap-3 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-black text-slate-900">{resolvedTitle}</CardTitle>
              <p className="mt-1 text-sm text-slate-500">{resolvedDescription}</p>
            </div>
            {source?.pdf_url ? (
              <Button variant="outline" className="h-9 rounded-xl text-xs font-bold" onClick={() => setPdfOpen(true)}>
                <Eye className="mr-2 h-3.5 w-3.5" />
                {t('studyPlan.previewPdf')}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!source ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
              {resolvedEmptyMessage}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {source.original_filename ? (
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {source.original_filename}
                  </Badge>
                ) : null}
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                  {t('studyPlan.rows', { count: rows.length })}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                  {t('studyPlan.columns', { count: columns.length })}
                </Badge>
              </div>

              <StudyPlanTableView
                columns={columns}
                rows={rows}
                emptyMessage={resolvedEmptyMessage}
              />

              {!source.pdf_url ? (
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                  <FileText className="h-4 w-4 text-slate-400" />
                  {t('studyPlan.pdfPreviewUnavailable')}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <StudyPlanPdfPreviewModal
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        pdfUrl={source?.pdf_url}
        filename={source?.original_filename}
        title={resolvedTitle}
      />
    </>
  )
}
