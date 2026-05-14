import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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
}

export function StudyPlanTableView({
  columns,
  rows,
  editable = false,
  selectedRowIndexes,
  onSelectedRowIndexesChange,
  onRowsChange,
  className,
  emptyMessage = 'No rows available.',
}: StudyPlanTableViewProps) {
  const allSelected = rows.length > 0 && selectedRowIndexes?.length === rows.length

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

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
      <Table className="min-w-[780px]">
        <TableHeader className="bg-slate-50">
          <TableRow className="hover:bg-slate-50">
            {editable && onSelectedRowIndexesChange ? (
              <TableHead className="h-11 w-12 px-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </TableHead>
            ) : null}
            {columns.map((column) => (
              <TableHead key={column} className="h-11 whitespace-nowrap px-3 text-[11px] font-black uppercase tracking-wide text-slate-500">
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + (editable ? 1 : 0)} className="px-4 py-8 text-center text-sm text-slate-500">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, rowIndex) => {
              const isSelected = selectedRowIndexes?.includes(rowIndex) ?? false
              return (
                <TableRow key={rowIndex} className={cn(isSelected && 'bg-blue-50/40')}>
                  {editable && onSelectedRowIndexesChange ? (
                    <TableCell className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => toggleRow(rowIndex, event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </TableCell>
                  ) : null}
                  {columns.map((column) => {
                    const value = row[column]
                    return (
                      <TableCell key={`${rowIndex}-${column}`} className="px-3 py-2 align-top">
                        {editable ? (
                          <Input
                            value={value == null ? '' : String(value)}
                            onChange={(event) => updateCell(rowIndex, column, event.target.value)}
                            className="h-10 rounded-xl border-slate-200 bg-white px-3 text-sm"
                          />
                        ) : (
                          <div className="min-h-10 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                            {value == null || String(value).trim() === '' ? '—' : String(value)}
                          </div>
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
