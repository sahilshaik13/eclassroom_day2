import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BlockingLoadingOverlayProps {
  open: boolean
  message?: string
  hint?: string
  className?: string
}

export function BlockingLoadingOverlay({
  open,
  message = 'Please wait…',
  hint = 'Do not close or submit again until this finishes.',
  className,
}: BlockingLoadingOverlayProps) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px]',
        className,
      )}
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={message}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="mx-4 flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-slate-200/90 bg-white px-8 py-7 shadow-2xl">
        <Loader2 className="h-9 w-9 animate-spin text-indigo-600" aria-hidden />
        <p className="text-center text-sm font-semibold text-slate-900">{message}</p>
        {hint ? (
          <p className="text-center text-xs font-medium text-slate-500">{hint}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
