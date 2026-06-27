import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  formatClockTimeLabel,
  HOURS_12,
  MINUTE_STEPS,
  type AmPm,
  type ClockTime12,
} from '@/lib/meetScheduleTime'

interface MeetClockTimePickerProps {
  value: ClockTime12
  onChange: (next: ClockTime12) => void
}

export function MeetClockTimePicker({ value, onChange }: MeetClockTimePickerProps) {
  const { t } = useTranslation()
  const setPeriod = (period: AmPm) => onChange({ ...value, period })

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-4 text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('meet.startTime')}</p>
        <p className="mt-1 font-mono text-3xl font-black tabular-nums text-slate-900">
          {formatClockTimeLabel(value)}
        </p>
      </div>

      <div className="relative mx-auto mb-4 flex h-40 w-40 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-dashed border-slate-200 bg-white shadow-inner" />
        <div className="relative z-10 grid grid-cols-4 gap-1 p-3">
          {HOURS_12.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onChange({ ...value, hour12: h })}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all',
                value.hour12 === h
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700',
              )}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {t('meet.minutes')}
        </p>
        <div className="flex flex-wrap justify-center gap-1">
          {MINUTE_STEPS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...value, minute: m })}
              className={cn(
                'min-w-[2.25rem] rounded-md px-1.5 py-1 text-[10px] font-bold',
                value.minute === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-indigo-50',
              )}
            >
              {String(m).padStart(2, '0')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center gap-2">
        {([{ val: 'AM' as const, label: t('meet.am') }, { val: 'PM' as const, label: t('meet.pm') }]).map(({ val: p, label }) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              'min-w-[4.5rem] rounded-xl px-4 py-2 text-sm font-black transition-all',
              value.period === p
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
