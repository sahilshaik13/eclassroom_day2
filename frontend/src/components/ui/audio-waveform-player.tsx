import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LiveWaveform } from '@/components/ui/live-waveform'

type AudioWaveformPlayerProps = {
  src: string
  className?: string
  height?: number
}

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const s = Math.floor(totalSeconds % 60)
  const m = Math.floor(totalSeconds / 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AudioWaveformPlayer({
  src,
  className,
  height = 44,
}: AudioWaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoaded = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onTime = () => setCurrentTime(audio.currentTime || 0)
    const onEnded = () => setPlaying(false)
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)

    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('play', onPlay)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('play', onPlay)
    }
  }, [src])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      void audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }

  const seekFromClientX = (clientX: number, target: HTMLDivElement) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = target.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    audio.currentTime = ratio * duration
    setCurrentTime(audio.currentTime)
  }

  return (
    <div className={cn('w-full min-w-0 space-y-2 overflow-hidden', className)}>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          aria-label={playing ? 'Pause audio' : 'Play audio'}
        >
          {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
        </button>
        <span className="shrink-0 text-[11px] font-semibold text-slate-500">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div
        role="slider"
        aria-label="Audio timeline"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.max(0, Math.round(currentTime))}
        onClick={(e) => seekFromClientX(e.clientX, e.currentTarget)}
        className="relative min-w-0 cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white p-1"
      >
        <LiveWaveform
          mode="static"
          audioUrl={src}
          height={height}
          barColor="#94a3b8"
          className="bg-slate-50"
        />
      </div>
    </div>
  )
}
