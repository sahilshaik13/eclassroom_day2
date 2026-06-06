import { clsx } from 'clsx'

/** Slightly stronger grey header to separate from body rows. */
export const bandedTableHeadClass = 'bg-slate-100'
export const bandedTableHeadCellClass =
  'border-b border-slate-200 text-slate-500'

/** Light R → G → B → Y gradient per row, repeating every 4 students. */
const RGBY_ROW_GRADIENTS = [
  'bg-gradient-to-r from-rose-50/95 via-rose-50/45 to-white',
  'bg-gradient-to-r from-emerald-50/95 via-emerald-50/45 to-white',
  'bg-gradient-to-r from-sky-50/95 via-sky-50/45 to-white',
  'bg-gradient-to-r from-amber-50/95 via-amber-50/45 to-white',
] as const

export function bandedTableRowClass(
  index: number,
  hoverClass = 'hover:brightness-[0.99]',
) {
  return clsx('transition-colors', hoverClass, RGBY_ROW_GRADIENTS[index % 4])
}

/** Golden alert band for students with submissions awaiting teacher review. */
export const pendingReviewRowClass =
  'bg-gradient-to-r from-amber-50/95 via-amber-50/50 to-white border-l-[3px] border-l-amber-400/90'

/** Shared grid template for teacher student list header + rows. */
export const teacherStudentRowGridClass =
  'grid items-center gap-3 sm:gap-4 grid-cols-[minmax(0,1fr)_4rem_5.5rem_1.25rem] md:grid-cols-[minmax(0,1fr)_4rem_7.5rem_5.5rem_1.25rem]'
