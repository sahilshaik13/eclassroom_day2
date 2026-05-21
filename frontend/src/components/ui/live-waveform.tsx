import { useEffect, useRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type LiveWaveformProps = HTMLAttributes<HTMLDivElement> & {
  active?: boolean
  processing?: boolean
  mode?: 'scrolling' | 'static'
  stream?: MediaStream | null
  barWidth?: number
  barHeight?: number
  barGap?: number
  barRadius?: number
  barColor?: string
  fadeEdges?: boolean
  fadeWidth?: number
  height?: number | string
  sensitivity?: number
  smoothingTimeConstant?: number
  fftSize?: number
  historySize?: number
  onError?: (error: Error) => void
  onStreamReady?: (stream: MediaStream) => void
  onStreamEnd?: () => void
}

const DEFAULT_HEIGHT = 64

export function LiveWaveform({
  active = false,
  processing = false,
  mode = 'scrolling',
  stream = null,
  barWidth = 3,
  barHeight = 4,
  barGap = 1,
  barRadius = 1.5,
  barColor,
  fadeEdges = true,
  fadeWidth = 24,
  height = DEFAULT_HEIGHT,
  sensitivity = 1,
  smoothingTimeConstant = 0.8,
  fftSize = 256,
  historySize = 60,
  className,
  onError,
  onStreamReady,
  onStreamEnd,
  ...props
}: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const historyRef = useRef<number[]>([])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      historyRef.current = []
      try {
        sourceRef.current?.disconnect()
      } catch {
        // ignore disconnect errors
      }
      sourceRef.current = null
      analyserRef.current = null
      const ctx = audioCtxRef.current
      audioCtxRef.current = null
      if (ctx) {
        void ctx.close().catch(() => {})
      }
      onStreamEnd?.()
    }
  }, [onStreamEnd])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    historyRef.current = []

    let cancelled = false

    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return

    const setupCanvasSize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const stopAudioNodes = () => {
      try {
        sourceRef.current?.disconnect()
      } catch {
        // ignore disconnect errors
      }
      sourceRef.current = null
      analyserRef.current = null
      const ac = audioCtxRef.current
      audioCtxRef.current = null
      if (ac) {
        void ac.close().catch(() => {})
      }
    }

    const drawRoundedBar = (
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      const r = Math.max(0, Math.min(barRadius, w / 2, h / 2))
      ctx2d.beginPath()
      ctx2d.moveTo(x + r, y)
      ctx2d.arcTo(x + w, y, x + w, y + h, r)
      ctx2d.arcTo(x + w, y + h, x, y + h, r)
      ctx2d.arcTo(x, y + h, x, y, r)
      ctx2d.arcTo(x, y, x + w, y, r)
      ctx2d.closePath()
      ctx2d.fill()
    }

    const drawFadeMask = (width: number, h: number) => {
      if (!fadeEdges || fadeWidth <= 0) return
      const leftGrad = ctx2d.createLinearGradient(0, 0, fadeWidth, 0)
      leftGrad.addColorStop(0, 'rgba(255,255,255,0.9)')
      leftGrad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx2d.fillStyle = leftGrad
      ctx2d.fillRect(0, 0, fadeWidth, h)

      const rightGrad = ctx2d.createLinearGradient(width - fadeWidth, 0, width, 0)
      rightGrad.addColorStop(0, 'rgba(255,255,255,0)')
      rightGrad.addColorStop(1, 'rgba(255,255,255,0.9)')
      ctx2d.fillStyle = rightGrad
      ctx2d.fillRect(width - fadeWidth, 0, fadeWidth, h)
    }

    setupCanvasSize()
    const onResize = () => setupCanvasSize()
    window.addEventListener('resize', onResize)

    let localAnalyser: AnalyserNode | null = null
    let freqData: Uint8Array | null = null

    if (active && stream) {
      try {
        const audioCtx = new AudioContext()
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = fftSize
        analyser.smoothingTimeConstant = smoothingTimeConstant

        const source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)

        audioCtxRef.current = audioCtx
        analyserRef.current = analyser
        sourceRef.current = source
        localAnalyser = analyser
        freqData = new Uint8Array(analyser.frequencyBinCount)
        onStreamReady?.(stream)
      } catch (err) {
        onError?.(err as Error)
      }
    } else {
      stopAudioNodes()
    }

    let phase = 0

    const render = () => {
      if (cancelled || !mountedRef.current) return
      const width = canvas.clientWidth
      const h = canvas.clientHeight
      if (!width || !h) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      ctx2d.clearRect(0, 0, width, h)
      const baseColor = barColor ?? 'rgb(99, 102, 241)'
      ctx2d.fillStyle = baseColor

      const centerY = h / 2
      const step = barWidth + barGap
      const totalBars = Math.max(1, Math.floor(width / step))

      if (localAnalyser && freqData) {
        localAnalyser.getByteFrequencyData(freqData)
        if (mode === 'scrolling') {
          const avg =
            freqData.reduce((sum, v) => sum + v, 0) / Math.max(1, freqData.length)
          const amplitude = Math.max(
            barHeight,
            (avg / 255) * h * 0.75 * Math.max(0.2, sensitivity),
          )
          historyRef.current.push(amplitude)
          if (historyRef.current.length > historySize) historyRef.current.shift()

          const bars = historyRef.current
          for (let i = 0; i < bars.length; i++) {
            const x = width - step * (bars.length - i)
            const bh = Math.max(barHeight, bars[i])
            drawRoundedBar(x, centerY - bh / 2, barWidth, bh)
          }
        } else {
          for (let i = 0; i < totalBars; i++) {
            const dataIndex = Math.floor((i / totalBars) * freqData.length)
            const value = freqData[dataIndex] ?? 0
            const bh = Math.max(
              barHeight,
              (value / 255) * h * 0.75 * Math.max(0.2, sensitivity),
            )
            const x = i * step
            drawRoundedBar(x, centerY - bh / 2, barWidth, bh)
          }
        }
      } else if (processing || active) {
        phase += 0.12
        for (let i = 0; i < totalBars; i++) {
          const x = i * step
          const wave =
            Math.sin(i * 0.35 + phase) * 0.5 + Math.sin(i * 0.12 + phase * 0.7) * 0.5
          const bh = Math.max(barHeight, Math.abs(wave) * h * 0.45)
          drawRoundedBar(x, centerY - bh / 2, barWidth, bh)
        }
      } else {
        for (let i = 0; i < totalBars; i++) {
          const x = i * step
          drawRoundedBar(x, centerY - barHeight / 2, barWidth, barHeight)
        }
      }

      drawFadeMask(width, h)
      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      stopAudioNodes()
    }
  }, [
    active,
    barColor,
    barGap,
    barHeight,
    barRadius,
    barWidth,
    fadeEdges,
    fadeWidth,
    fftSize,
    historySize,
    mode,
    onError,
    onStreamEnd,
    onStreamReady,
    processing,
    sensitivity,
    smoothingTimeConstant,
    stream,
  ])

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-lg bg-slate-100/80', className)}
      style={{ height }}
      {...props}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-label="Live audio waveform"
      />
    </div>
  )
}
