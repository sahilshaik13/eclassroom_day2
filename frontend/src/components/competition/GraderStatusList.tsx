import { ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Competition } from '@/types'

type GraderStatusListProps = {
  competition: Competition
  dense?: boolean
}

function summarizeNames(names: string[]) {
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

/** Clickable grader list (same pattern as exam setup) with Pending/Corrected per row. */
export function GraderStatusList({ competition, dense }: GraderStatusListProps) {
  const graders = competition.graders || []
  const triggerClass = dense ? '!py-px !text-[10px]' : undefined

  if (!graders.length) {
    return <span className="text-[11px] text-slate-400">—</span>
  }

  const correctedIds = new Set((competition.corrected_grader_ids || []).map(String))
  const names = graders.map((g) => g.name.trim()).filter(Boolean)
  const summary = summarizeNames(names)

  return (
    <div className="min-w-0 max-w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={clsx(
              'flex w-full min-w-0 max-w-full items-center gap-0.5 rounded-md px-0.5 py-0.5 text-left text-[11px] text-slate-700 underline decoration-slate-300 underline-offset-2 hover:bg-slate-100/80 hover:decoration-slate-600',
              triggerClass,
            )}
          >
            <span className="min-w-0 flex-1 truncate">{summary}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <div className="max-h-64 w-72 overflow-y-auto p-0">
            <p className="border-b border-slate-100 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Graders
            </p>
            <ul className="px-2 py-1.5">
              {graders.map((g) => {
                const corrected = correctedIds.has(String(g.teacher_id))
                return (
                  <li
                    key={g.teacher_id}
                    className="flex items-center justify-between gap-2 border-b border-slate-50 py-1.5 text-sm text-slate-800 last:border-0"
                  >
                    <span className="min-w-0 truncate">{g.name}</span>
                    <span
                      className={clsx(
                        'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        corrected
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-800',
                      )}
                    >
                      {corrected ? 'Corrected' : 'Pending'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
