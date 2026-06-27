import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { clsx } from 'clsx'
import { bandedTableHeadCellClass, bandedTableHeadClass, bandedTableRowClass } from '@/lib/tableBandStyles'

export interface StudyPlanTableRow {
  [key: string]: string | number | null | undefined
}

interface StudyPlanTableViewProps {
  columns: string[]
  rows: StudyPlanTableRow[]
  editable?: boolean
  selectedRowIndexes?: number[]
  onSelectedRowIndexesChange?: (indexes: number[]) => void
  onRowsChange?: (rows: StudyPlanTableRow[]) => void
  className?: string
  emptyMessage?: string
  /** When set, only this many rows render per page with prev/next navigation. */
  rowsPerPage?: number
}

export function StudyPlanTableView({
  columns,
  rows,
  editable = false,
  selectedRowIndexes,
  onSelectedRowIndexesChange,
  onRowsChange,
  className,
  emptyMessage,
  rowsPerPage,
}: StudyPlanTableViewProps) {
  const { t } = useTranslation()
  const resolvedEmptyMessage = emptyMessage ?? t('common.noRowsAvailable')
  const [page, setPage] = useState(0)
  const pageSize = rowsPerPage && rowsPerPage > 0 ? rowsPerPage : rows.length
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const paginated = Boolean(rowsPerPage && rowsPerPage > 0 && rows.length > rowsPerPage)
  const safePage = Math.min(page, pageCount - 1)
  const startIndex = safePage * pageSize
  const endIndex = Math.min(startIndex + pageSize, rows.length)
  const visibleRows = paginated ? rows.slice(startIndex, endIndex) : rows

  useEffect(() => {
    setPage(0)
  }, [rows.length, rowsPerPage])

  useEffect(() => {
    if (page > pageCount - 1) {
      setPage(Math.max(0, pageCount - 1))
    }
  }, [page, pageCount])

  const allSelected = rows.length > 0 && selectedRowIndexes?.length === rows.length
  const pageAllSelected =
    paginated &&
    visibleRows.length > 0 &&
    visibleRows.every((_, localIndex) => selectedRowIndexes?.includes(startIndex + localIndex))

  const updateCell = (rowIndex: number, column: string, value: string) => {
    if (!onRowsChange) return
    const next = rows.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row))
    onRowsChange(next)
  }

  const toggleRow = (rowIndex: number, checked: boolean) => {
    if (!onSelectedRowIndexesChange) return
    const current = new Set(selectedRowIndexes || [])
    if (checked) current.add(rowIndex)
    else current.delete(rowIndex)
    onSelectedRowIndexesChange(Array.from(current).sort((a, b) => a - b))
  }

  const toggleAll = (checked: boolean) => {
    if (!onSelectedRowIndexesChange) return
    onSelectedRowIndexesChange(checked ? rows.map((_, index) => index) : [])
  }

  const togglePageAll = (checked: boolean) => {
    if (!onSelectedRowIndexesChange || !paginated) return
    const current = new Set(selectedRowIndexes || [])
    for (let local = 0; local < visibleRows.length; local += 1) {
      const global = startIndex + local
      if (checked) current.add(global)
      else current.delete(global)
    }
    onSelectedRowIndexesChange(Array.from(current).sort((a, b) => a - b))
  }

  const headerChecked = paginated ? pageAllSelected : allSelected
  const headerToggle = paginated ? togglePageAll : toggleAll

  const paginationBar = paginated ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
      <p className="text-xs font-semibold text-slate-600">
        {t('common.rowsOf', { start: startIndex + 1, end: endIndex, total: rows.length })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg px-2"
          disabled={safePage <= 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          aria-label="Previous rows"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[4.5rem] text-center text-xs font-bold text-slate-700">
          {t('common.page')} {safePage + 1} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg px-2"
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          aria-label="Next rows"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  ) : null

  return (
    <div className={cn('space-y-2', className)}>
      {paginationBar}
      <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="min-w-[600px]">
          <div
            className={clsx('grid border-b', bandedTableHeadClass, bandedTableHeadCellClass)}
            style={{ gridTemplateColumns: editable ? `36px repeat(${columns.length}, minmax(100px, 1fr))` : `repeat(${columns.length}, minmax(100px, 1fr))` }}
          >
            {editable && onSelectedRowIndexesChange ? (
              <div className="flex h-9 items-center justify-center px-1" title={t('common.selectAll')}>
                <input
                  type="checkbox"
                  checked={headerChecked}
                  onChange={(event) => headerToggle(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
              </div>
            ) : null}
            {columns.map((column) => (
              <div
                key={column}
                className="flex h-9 items-center px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"
              >
                <span className="truncate">{column}</span>
              </div>
            ))}
          </div>

          <div>
            {rows.length === 0 ? (
              <div className="flex items-center justify-center px-3 py-6 text-xs text-slate-500" style={{ minHeight: '80px' }}>
                {resolvedEmptyMessage}
              </div>
            ) : (
              visibleRows.map((row, localIndex) => {
                const rowIndex = startIndex + localIndex
                const isSelected = selectedRowIndexes?.includes(rowIndex) ?? false
                return (
                  <div
                    key={rowIndex}
                    className={cn(
                      'grid items-stretch',
                      bandedTableRowClass(rowIndex),
                      isSelected && 'ring-1 ring-inset ring-sky-200/90',
                    )}
                    style={{ gridTemplateColumns: editable ? `36px repeat(${columns.length}, minmax(100px, 1fr))` : `repeat(${columns.length}, minmax(100px, 1fr))` }}
                  >
                    {editable && onSelectedRowIndexesChange ? (
                      <div className="flex items-center justify-center px-1 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(event) => toggleRow(rowIndex, event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300"
                        />
                      </div>
                    ) : null}
                    {columns.map((column) => {
                      const value = row[column]
                      return (
                        <div key={`${rowIndex}-${column}`} className="flex items-stretch px-2 py-1.5 min-h-[40px]">
                          {editable ? (
                            <Input
                              value={value == null ? '' : String(value)}
                              onChange={(event) => updateCell(rowIndex, column, event.target.value)}
                              className="h-8 w-full rounded-lg border-slate-200/80 bg-white/90 px-2 text-xs shadow-none"
                            />
                          ) : (
                            <div className="flex w-full items-center whitespace-pre-wrap rounded-lg bg-white/60 px-2 py-1.5 text-xs text-slate-700 min-h-[28px]">
                              {value == null || String(value).trim() === '' ? (
                                <span className="text-slate-300">—</span>
                              ) : (
                                String(value)
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
      {paginationBar}
    </div>
  )
}
