export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file)
}

/** Scroll only the chat message pane, not the page. */
export function scrollChatPaneToBottom(
  pane: HTMLDivElement | null,
  behavior: ScrollBehavior = 'smooth',
): void {
  if (!pane) return
  pane.scrollTo({ top: pane.scrollHeight, behavior })
}

export function doubtPreviewLabel(opts: {
  text?: string | null
  replyType?: 'text' | 'audio' | 'file'
  fileName?: string | null
}): string {
  const text = (opts.text ?? '').trim()
  if (text) return text
  if (opts.replyType === 'audio') return 'Voice message'
  if (opts.replyType === 'file') return opts.fileName || 'File attachment'
  return 'New message'
}
