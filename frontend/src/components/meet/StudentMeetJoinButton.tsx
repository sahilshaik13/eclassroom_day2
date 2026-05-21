import { useEffect, useState } from 'react'
import { ExternalLink, Lock, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canJoinMeeting, joinOpensLabel } from '@/lib/meetScheduleTime'
import { cn } from '@/lib/utils'

interface StudentMeetJoinButtonProps {
  meetUrl: string
  startAt: string
  variant?: 'hero' | 'card'
}

export function StudentMeetJoinButton({
  meetUrl,
  startAt,
  variant = 'card',
}: StudentMeetJoinButtonProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [startAt])

  const canJoin = canJoinMeeting(startAt, now)
  const opensLabel = joinOpensLabel(startAt)

  if (canJoin) {
    return (
      <a
        href={meetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center gap-1 font-black',
          variant === 'hero'
            ? 'gap-2 rounded-xl bg-white px-4 py-2.5 text-sm text-indigo-700 hover:bg-indigo-50'
            : 'rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700',
        )}
      >
        <PlayCircle className={variant === 'hero' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
        Join {variant === 'hero' ? 'Class' : 'Meet'}
        <ExternalLink className={variant === 'hero' ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
      </a>
    )
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button
        type="button"
        disabled
        className={cn(
          'cursor-not-allowed gap-1 opacity-80',
          variant === 'hero'
            ? 'rounded-xl border-white/30 bg-white/20 text-white'
            : 'h-auto rounded-lg bg-slate-200 px-3 py-1.5 text-xs text-slate-500',
        )}
      >
        <Lock className={variant === 'hero' ? 'h-4 w-4' : 'h-3 w-3'} />
        Join {variant === 'hero' ? 'Class' : 'Meet'}
      </Button>
      {opensLabel ? (
        <span
          className={cn(
            'text-[10px] font-semibold',
            variant === 'hero' ? 'text-indigo-100' : 'text-slate-500',
          )}
        >
          {opensLabel}
        </span>
      ) : null}
    </div>
  )
}
