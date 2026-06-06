import { Check, CheckCheck, Clock, FileText } from 'lucide-react'
import { clsx } from 'clsx'
import type { DoubtChatMessage } from '@/lib/doubtChatMerge'
import { AudioWaveformPlayer } from '@/components/ui/audio-waveform-player'

type DoubtChatBubbleProps = {
  message: DoubtChatMessage
  /** Which side is "mine" in this chat view. */
  outgoingSide: 'student' | 'teacher'
  formatTime: (dateStr: string) => string
}

function isSending(message: DoubtChatMessage): boolean {
  if (message.failed) return false
  return message.deliveryStatus === 'sending' || !!message.pending
}

function OutgoingStatus({ message }: { message: DoubtChatMessage }) {
  if (message.failed) {
    return <span className="text-[9px] text-rose-500">Failed</span>
  }
  if (isSending(message)) {
    return <Clock className="h-3 w-3 shrink-0 opacity-70" aria-label="Sending" />
  }
  if (message.deliveryStatus === 'read' || message.teacherSeen) {
    return <CheckCheck className="h-3 w-3 shrink-0 text-[#53bdeb]" aria-label="Read" />
  }
  return <Check className="h-3 w-3 shrink-0 opacity-80" aria-label="Delivered" />
}

function displayTimestamp(message: DoubtChatMessage, outgoing: boolean): string {
  if (outgoing) {
    return message.sentAt ?? message.createdAt
  }
  return message.receivedAt ?? message.createdAt
}

export function DoubtChatBubble({ message, outgoingSide, formatTime }: DoubtChatBubbleProps) {
  const outgoing = message.side === outgoingSide
  const timeLabel = displayTimestamp(message, outgoing)

  return (
    <div className={clsx('flex', outgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'relative max-w-[78%] rounded-md px-2 py-1 shadow-sm',
          outgoing
            ? 'rounded-tr-sm bg-[#d9fdd3] text-slate-900'
            : 'rounded-tl-sm bg-white text-slate-900',
        )}
      >
        {message.text?.trim() && (
          <p className="whitespace-pre-wrap text-[13px] leading-snug">{message.text}</p>
        )}

        {(message.replyType === 'audio' || message.audioUrl) && message.audioUrl && (
          <div className="mt-0.5 min-w-[160px]">
            <AudioWaveformPlayer src={message.audioUrl} height={32} />
          </div>
        )}

        {(message.replyType === 'file' || message.fileUrl) && message.fileUrl && (
          <a
            href={message.fileUrl}
            download={message.fileName || 'attachment'}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 flex items-center gap-1.5 rounded bg-black/5 px-1.5 py-1 text-[11px] font-medium text-[#128c7e] hover:underline"
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{message.fileName || 'Download file'}</span>
          </a>
        )}

        <div
          className={clsx(
            'mt-0.5 flex items-center justify-end gap-0.5 text-[9px] leading-none',
            outgoing ? 'text-[#667781]' : 'text-slate-400',
          )}
        >
          <span title={outgoing ? 'Sent at' : 'Received at'}>{formatTime(timeLabel)}</span>
          {outgoing && <OutgoingStatus message={message} />}
        </div>
      </div>
    </div>
  )
}
