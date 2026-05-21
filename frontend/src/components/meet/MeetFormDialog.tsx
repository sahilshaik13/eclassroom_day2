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

export const MEET_DURATION_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
  { value: 90, label: '90 min' },
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Change meeting time' : 'Create Google Meet'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Students can only join after the new start time. Google Calendar is updated when connected.'
              : 'Pick date and time on the clock. Students can join only after the scheduled start.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">Title</span>
            <Input value={title} onChange={(e) => onTitleChange(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">Date</span>
            <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
          </label>
          <MeetClockTimePicker value={clock} onChange={onClockChange} />
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">Duration</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={duration}
              onChange={(e) => onDurationChange(Number(e.target.value))}
            >
              {MEET_DURATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={onSubmit} className="gap-1.5">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'edit' ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <Video className="h-4 w-4" />
            )}
            {mode === 'edit' ? 'Save time' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
