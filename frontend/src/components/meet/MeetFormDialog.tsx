import { useTranslation } from 'react-i18next'
import { Loader2, Pencil, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MeetClockTimePicker } from '@/components/meet/MeetClockTimePicker'
import type { ClockTime12 } from '@/lib/meetScheduleTime'

export const MEET_DURATION_KEYS = [
  { value: 30, key: 'meet.duration30' },
  { value: 45, key: 'meet.duration45' },
  { value: 60, key: 'meet.duration60' },
  { value: 90, key: 'meet.duration90' },
] as const

export function MeetFormDialog({
  open,
  onOpenChange,
  mode,
  title,
  onTitleChange,
  date,
  onDateChange,
  clock,
  onClockChange,
  duration,
  onDurationChange,
  busy,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'create' | 'edit'
  title: string
  onTitleChange: (v: string) => void
  date: string
  onDateChange: (v: string) => void
  clock: ClockTime12
  onClockChange: (v: ClockTime12) => void
  duration: number
  onDurationChange: (v: number) => void
  busy: boolean
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? t('meet.changeMeetingTime') : t('meet.createGoogleMeet')}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? t('meet.descChange')
              : t('meet.descCreate')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">{t('meet.titleLabel')}</span>
            <Input value={title} onChange={(e) => onTitleChange(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">{t('meet.dateLabel')}</span>
            <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
          </label>
          <MeetClockTimePicker value={clock} onChange={onClockChange} />
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">{t('meet.durationLabel')}</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={duration}
              onChange={(e) => onDurationChange(Number(e.target.value))}
            >
              {MEET_DURATION_KEYS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.key)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={busy} onClick={onSubmit} className="gap-1.5">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'edit' ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <Video className="h-4 w-4" />
            )}
            {mode === 'edit' ? t('meet.saveTime') : t('meet.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
