import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Eye,
  FileUp,
  Loader2,
  RefreshCcw,
  RotateCcw,
  SquareX,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { StudyPlanPdfImport } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StudyPlanTableView } from '@/components/study-plan/StudyPlanTableView'
import { StudyPlanPdfPreviewModal } from '@/components/study-plan/StudyPlanPdfPreviewModal'

interface AdminStudyPlanImportCardProps {
  classId: string
  className: string
  startDate?: string
  endDate?: string
  onApplied?: () => void
}

const BUCKET_OPTIONS = [
  { value: 'hifz', label: 'Hifz' },
  { value: 'kubra', label: 'Kubra' },
  { value: 'sughra', label: 'Sughra' },
  { value: 'tajweed', label: 'Tajweed' },
] as const

const SCHEDULE_COLUMN_HINTS = [
  'date',
  'day/date',
  'day date',
  'التاريخ',
  'التاريخ الميلادي',
  'schedule date',
  'day',
  'day no',
  'day number',
  'اليوم',
  'رقم اليوم',
] as const

const SUPPORTING_COLUMN_HINTS = {
  pageCount: [
    'number of pages',
    'no. of pages',
    'no of pages',
    'page count',
    'pages count',
    'عدد الصفحات',
    'عدد الاوجه',
    'عدد الأوجه',
  ],
  interpretationPage: [
    'interpretation curriculum/page',
    'interpretation page',
    'tafsir page',
    'meaning page',
    'lesson page',
    'صفحة التفسير',
    'منهج التفسير',
    'التفسير',
  ],
} as const

function isScheduleColumn(column: string) {
  const value = column.trim().toLowerCase()
  return SCHEDULE_COLUMN_HINTS.some((hint) => value.includes(hint))
}

function supportingFieldLabel(column: string) {
  const value = column.trim().toLowerCase()
  if (SUPPORTING_COLUMN_HINTS.pageCount.some((hint) => value.includes(hint))) {
    return 'Hifz page count'
  }
  if (SUPPORTING_COLUMN_HINTS.interpretationPage.some((hint) => value.includes(hint))) {
    return 'Tafseer page ref'
  }
  return null
}

function statusTone(status: StudyPlanPdfImport['ocr_status']) {
  switch (status) {
    case 'completed':
    case 'applied':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200'
    case 'cancelled':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200'
  }
}

export function AdminStudyPlanImportCard({
  classId,
  className,
  startDate,
  endDate,
  onApplied,
}: AdminStudyPlanImportCardProps) {
  const [currentImport, setCurrentImport] = useState<StudyPlanPdfImport | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [pendingColumns, setPendingColumns] = useState<string[]>([])
  const [columnBucketMap, setColumnBucketMap] = useState<Record<string, string>>({})
  const [tableRows, setTableRows] = useState<Record<string, string>[]>([])
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<number[]>([])
  const [pdfOpen, setPdfOpen] = useState(false)

  const displayedColumns = useMemo(() => {
    if (!currentImport) return []
    return currentImport.selected_columns?.length
      ? currentImport.selected_columns
      : currentImport.detected_columns || []
  }, [currentImport])

  const preferredRows = (payload: StudyPlanPdfImport | null) => {
    if (!payload) return []
    if (payload.filtered_rows?.length) return payload.filtered_rows
    if (payload.extracted_rows?.length) return payload.extracted_rows
    if (payload.applied_rows?.length) return payload.applied_rows
    return []
  }

  const normalizeBucketMap = (payload: StudyPlanPdfImport | null, columns: string[]) =>
    Object.fromEntries(
      columns
        .filter((column) => !isScheduleColumn(column) && !supportingFieldLabel(column))
        .map((column) => [column, payload?.column_bucket_map?.[column] || 'kubra'])
    )

  const hydrateImportState = (payload: StudyPlanPdfImport | null) => {
    setCurrentImport(payload)
    const nextColumns = payload?.selected_columns?.length
      ? payload.selected_columns
      : payload?.detected_columns || []
    setPendingColumns(nextColumns)
    setColumnBucketMap(normalizeBucketMap(payload, nextColumns))
    const nextRows = preferredRows(payload)
    setTableRows(nextRows)
    setSelectedRowIndexes(nextRows.map((_, index) => index))
  }

  const selectedBucketMap = Object.fromEntries(
    pendingColumns
      .filter((column) => !isScheduleColumn(column) && !supportingFieldLabel(column))
      .map((column) => [column, columnBucketMap[column] || currentImport?.column_bucket_map?.[column] || 'kubra'])
  )

  const loadCurrentImport = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await api.get(`/admin/classrooms/${classId}/study-plan-imports/current`)
      const payload = (res.data?.data || null) as StudyPlanPdfImport | null
      hydrateImportState(payload)
    } catch {
      toast.error('Failed to load OCR study-plan import')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    void loadCurrentImport()
  }, [classId])

  useEffect(() => {
    if (!currentImport || !['uploading', 'processing'].includes(currentImport.ocr_status)) return
    const timer = window.setTimeout(() => {
      void loadCurrentImport(true)
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [currentImport, classId])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    try {
      const res = await api.postForm(`/admin/classrooms/${classId}/study-plan-imports/upload`, {
        file,
      }, {
        timeout: 120_000,
      })
      const payload = res.data?.data as StudyPlanPdfImport
      hydrateImportState(payload)
      toast.success('PDF uploaded. OCR processing has started.')
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED') {
        toast.error('Upload timed out while waiting for OCR. Please try again.')
      } else {
        toast.error(
          err?.response?.data?.error?.message
          || err?.response?.data?.detail?.[0]?.msg
          || 'Failed to upload PDF'
        )
      }
    } finally {
      setUploading(false)
    }
  }

  const handleRefresh = async () => {
    if (!currentImport) return
    setSyncing(true)
    try {
      const res = await api.post(`/admin/study-plan-imports/${currentImport.id}/refresh`)
      const payload = res.data?.data as StudyPlanPdfImport
      hydrateImportState(payload)
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to refresh OCR status')
    } finally {
      setSyncing(false)
    }
  }

  const handleApplyColumnSelection = async () => {
    if (!currentImport) return
    if (!pendingColumns.length) {
      toast.error('Select at least one column')
      return
    }
    setSyncing(true)
    try {
      const res = await api.post(`/admin/study-plan-imports/${currentImport.id}/select-columns`, {
        selected_columns: pendingColumns,
        column_bucket_map: selectedBucketMap,
      })
      const payload = res.data?.data as StudyPlanPdfImport
      hydrateImportState(payload)
      toast.success('Table updated')
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to update selected columns')
    } finally {
      setSyncing(false)
    }
  }

  const handleCancel = async () => {
    if (!currentImport) return
    setSyncing(true)
    try {
      const res = await api.post(`/admin/study-plan-imports/${currentImport.id}/cancel`)
      hydrateImportState(res.data?.data as StudyPlanPdfImport)
      toast.success('OCR job cancelled')
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to cancel OCR job')
    } finally {
      setSyncing(false)
    }
  }

  const handleRetry = async () => {
    if (!currentImport) return
    setSyncing(true)
    try {
      const res = await api.post(`/admin/study-plan-imports/${currentImport.id}/retry`)
      hydrateImportState(res.data?.data as StudyPlanPdfImport)
      toast.success('OCR job retried')
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to retry OCR job')
    } finally {
      setSyncing(false)
    }
  }

  const handleApplyToClass = async () => {
    if (!currentImport) return
    if (!pendingColumns.length) {
      toast.error('Select at least one column before applying')
      return
    }
    const selectedRows = tableRows.filter((_, index) => selectedRowIndexes.includes(index))
    if (!selectedRows.length) {
      toast.error('Select at least one row before applying')
      return
    }
    setApplying(true)
    try {
      await api.post(`/admin/study-plan-imports/${currentImport.id}/apply`, {
        selected_columns: pendingColumns,
        column_bucket_map: selectedBucketMap,
        rows: selectedRows,
        selected_row_indexes: selectedRowIndexes,
        start_date: startDate || null,
        end_date: endDate || null,
      }, {
        timeout: 180_000,
      })
      toast.success(`Applied study plan to ${className}`)
      await loadCurrentImport(true)
      onApplied?.()
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED') {
        toast.error('Applying the study plan timed out. Please wait a bit and refresh.')
      } else {
        toast.error(err?.response?.data?.error?.message || 'Failed to apply study plan')
      }
    } finally {
      setApplying(false)
    }
  }

  const visibleRows = tableRows

  return (
    <>
      <Card className="rounded-3xl border-slate-200/80 shadow-sm">
        <CardHeader className="gap-3 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-black text-slate-900">AI PDF Import</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Upload the Arabic study-plan PDF for this class, review the extracted table, then apply it for the teacher and students.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              Upload PDF
              <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading current import...
            </div>
          ) : !currentImport ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
              No PDF has been uploaded for this class yet.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={statusTone(currentImport.ocr_status)}>
                  {currentImport.ocr_status}
                </Badge>
                {startDate ? (
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    Start {new Date(startDate).toLocaleDateString()}
                  </Badge>
                ) : null}
                {endDate ? (
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    End {new Date(endDate).toLocaleDateString()}
                  </Badge>
                ) : null}
                {currentImport.original_filename ? (
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {currentImport.original_filename}
                  </Badge>
                ) : null}
                {currentImport.ocr_status === 'applied' ? (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Active for class
                  </Badge>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      OCR Progress: {currentImport.completed_chunks || 0} / {currentImport.total_chunks || 0}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {currentImport.parse_message || 'Waiting for OCR updates.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="h-9 rounded-xl text-xs font-bold" onClick={handleRefresh} disabled={syncing}>
                      {syncing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" />}
                      Refresh
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 rounded-xl text-xs font-bold"
                      onClick={() => setPdfOpen(true)}
                      disabled={!currentImport.pdf_url}
                    >
                      <Eye className="mr-2 h-3.5 w-3.5" />
                      Preview PDF
                    </Button>
                    {currentImport.ocr_status === 'failed' || currentImport.ocr_status === 'cancelled' ? (
                      <Button variant="outline" className="h-9 rounded-xl text-xs font-bold" onClick={handleRetry} disabled={syncing}>
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        Retry
                      </Button>
                    ) : null}
                    {['uploading', 'processing'].includes(currentImport.ocr_status) ? (
                      <Button variant="outline" className="h-9 rounded-xl text-xs font-bold" onClick={handleCancel} disabled={syncing}>
                        <SquareX className="mr-2 h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-900 transition-all"
                    style={{
                      width: `${currentImport.total_chunks ? Math.min(100, Math.round(((currentImport.completed_chunks || 0) / currentImport.total_chunks) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>

              {(currentImport.detected_columns?.length || pendingColumns.length) ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Columns to keep in the final table</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Pick the columns that should stay visible and be converted into the class study plan.
                      </p>
                    </div>
                    <Button variant="outline" className="h-9 rounded-xl text-xs font-bold" onClick={handleApplyColumnSelection} disabled={syncing}>
                      {syncing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" />}
                      Update table
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {(currentImport.detected_columns || []).map((column) => {
                      const checked = pendingColumns.includes(column)
                      const scheduleColumn = isScheduleColumn(column)
                      const supportingLabel = supportingFieldLabel(column)
                      return (
                        <div
                          key={column}
                          className={`rounded-2xl border p-3 ${
                            checked ? 'border-slate-900 bg-slate-900/95 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <label className="inline-flex items-center gap-2 text-xs font-bold">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  setPendingColumns((prev) =>
                                    event.target.checked ? [...prev, column] : prev.filter((item) => item !== column)
                                  )
                                }}
                                className="h-4 w-4 rounded"
                              />
                              <span>{column}</span>
                            </label>
                            {scheduleColumn ? (
                              <Badge
                                variant="outline"
                                className={checked ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-600'}
                              >
                                Schedule field
                              </Badge>
                            ) : supportingLabel ? (
                              <Badge
                                variant="outline"
                                className={checked ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-600'}
                              >
                                {supportingLabel}
                              </Badge>
                            ) : (
                              <div className="sm:w-40">
                                <Select
                                  value={columnBucketMap[column] || 'kubra'}
                                  onValueChange={(value) =>
                                    setColumnBucketMap((prev) => ({ ...prev, [column]: value }))
                                  }
                                >
                                  <SelectTrigger className={`h-9 rounded-xl border text-xs font-bold ${checked ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                                    <SelectValue placeholder="Academic bucket" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {BUCKET_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value} className="text-xs font-medium">
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Editable OCR Table</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Edit any cell before applying. Selected rows will become the class study plan.
                    </p>
                  </div>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {selectedRowIndexes.length} / {visibleRows.length} rows selected
                  </Badge>
                </div>

                <StudyPlanTableView
                  columns={displayedColumns}
                  rows={visibleRows}
                  editable
                  selectedRowIndexes={selectedRowIndexes}
                  onSelectedRowIndexesChange={setSelectedRowIndexes}
                  onRowsChange={(rows) => setTableRows(rows as Record<string, string>[])}
                  emptyMessage="Run OCR and keep at least one column to review the extracted rows."
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm text-slate-600">
                  Applying this PDF will replace the current study plan for <span className="font-bold text-slate-900">{className}</span> and archive the previous one.
                </p>
                <Button
                  onClick={handleApplyToClass}
                  disabled={applying || !displayedColumns.length || !visibleRows.length}
                  className="h-10 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800"
                >
                  {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Apply to class
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <StudyPlanPdfPreviewModal
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        pdfUrl={currentImport?.pdf_url}
        filename={currentImport?.original_filename}
        title={`${className} Study Plan PDF`}
      />
    </>
  )
}
