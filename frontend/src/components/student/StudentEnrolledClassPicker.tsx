import { clsx } from 'clsx'
import { User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const DOT_OVERLAY =
  'radial-gradient(circle at 2px 2px, rgb(99 102 241 / 0.07) 1px, transparent 0)'

export interface EnrolledClassOption {
  id: string
  name: string
  teacher?: { name?: string }
}

interface StudentEnrolledClassPickerProps {
  classes: EnrolledClassOption[]
  selectedClassId: string
  onSelect: (classId: string) => void
  heading?: string
}

export function StudentEnrolledClassPicker({
  classes,
  selectedClassId,
  onSelect,
  heading,
}: StudentEnrolledClassPickerProps) {
  const { t } = useTranslation()
  const displayHeading = heading ?? t('student.enrolledClasses.heading')
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {displayHeading}
      </h3>
      <div className="flex flex-wrap gap-2.5 sm:gap-3">
        {classes.map((c) => {
          const selected = c.id === selectedClassId
          const teacherName = c.teacher?.name?.trim() || t('student.enrolledClasses.teacherFallback')
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              title={`${c.name} · ${teacherName}`}
              className={clsx(
                'group relative min-w-[9.5rem] max-w-full overflow-hidden rounded-2xl px-4 py-3 text-left transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                selected
                  ? 'bg-[radial-gradient(ellipse_at_top_left,_#6366f1_0%,_#7c3aed_52%,_#4338ca_100%)] text-white shadow-lg shadow-indigo-500/25 ring-2 ring-indigo-300/50'
                  : 'border border-indigo-100/90 bg-[radial-gradient(ellipse_at_top_left,_#eef2ff_0%,_#f5f3ff_45%,_#ffffff_100%)] text-slate-800 shadow-sm hover:border-indigo-200 hover:shadow-md',
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  'pointer-events-none absolute inset-0 opacity-60',
                  selected ? 'opacity-30' : 'opacity-100',
                )}
                style={{
                  backgroundImage: selected
                    ? 'radial-gradient(circle at 2px 2px, rgb(255 255 255 / 0.12) 1px, transparent 0)'
                    : DOT_OVERLAY,
                  backgroundSize: '18px 18px',
                }}
              />
              <span className="relative z-10 block truncate text-sm font-bold leading-tight">
                {c.name}
              </span>
              <span
                className={clsx(
                  'relative z-10 mt-1 flex items-center gap-1 truncate text-[11px] font-medium',
                  selected ? 'text-indigo-100/95' : 'text-slate-500',
                )}
              >
                <User className={clsx('h-3 w-3 shrink-0', selected ? 'text-indigo-200' : 'text-slate-400')} />
                {teacherName}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
