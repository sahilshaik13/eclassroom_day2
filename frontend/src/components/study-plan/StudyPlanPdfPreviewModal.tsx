import { FileText, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface StudyPlanPdfPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pdfUrl?: string | null
  title?: string | null
  filename?: string | null
}

export function StudyPlanPdfPreviewModal({
  open,
  onOpenChange,
  pdfUrl,
  title,
  filename,
}: StudyPlanPdfPreviewModalProps) {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('studyPlan.pdfTitle')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl rounded-3xl border-slate-200 bg-white p-0">
        <DialogHeader className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-black text-slate-900">{resolvedTitle}</DialogTitle>
              {filename ? <p className="mt-1 truncate text-xs text-slate-500">{filename}</p> : null}
            </div>
            {pdfUrl ? (
              <Button variant="outline" className="h-9 rounded-xl text-xs font-bold" asChild>
                <a href={pdfUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  {t('studyPlan.openNewTab')}
                </a>
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <div className="h-[75vh] bg-slate-50">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              title={resolvedTitle}
              className="h-full w-full rounded-b-3xl border-0"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <FileText className="h-8 w-8 text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{t('studyPlan.pdfUnavailable')}</p>
                <p className="mt-1 text-sm text-slate-500">{t('studyPlan.pdfUnavailableDesc')}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
