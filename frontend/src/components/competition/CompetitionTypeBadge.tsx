import { clsx } from 'clsx'
import type { Competition } from '@/types'
import { deriveCompetitionDisplayTag } from '@/lib/competitionExam'

type Props = {
  competition: Pick<Competition, 'content' | 'category'>
  dense?: boolean
  className?: string
}

const VARIANT_CLS: Record<string, string> = {
  mcq: 'bg-violet-50 text-violet-700 border-violet-100',
  mixed: 'bg-amber-50 text-amber-800 border-amber-100',
  short_answer: 'bg-sky-50 text-sky-700 border-sky-100',
  long_answer: 'bg-cyan-50 text-cyan-800 border-cyan-100',
  image_upload: 'bg-rose-50 text-rose-700 border-rose-100',
  audio_upload: 'bg-teal-50 text-teal-800 border-teal-100',
  empty: 'bg-slate-50 text-slate-500 border-slate-100',
}

export function CompetitionTypeBadge({ competition, dense, className }: Props) {
  const tag = deriveCompetitionDisplayTag(competition.content, competition.category)
  return (
    <span
      className={clsx(
        'inline-block max-w-full truncate rounded border font-black uppercase tracking-wide',
        dense ? 'px-1 py-px text-[8px]' : 'px-1.5 py-0.5 text-[9px]',
        VARIANT_CLS[tag.variant] || VARIANT_CLS.mixed,
        className,
      )}
      title={tag.label}
    >
      {tag.label}
    </span>
  )
}

export function getCompetitionDisplayTag(competition: Pick<Competition, 'content' | 'category'>) {
  return deriveCompetitionDisplayTag(competition.content, competition.category)
}
