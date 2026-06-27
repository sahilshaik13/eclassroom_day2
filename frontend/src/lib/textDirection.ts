export type TextDirection = 'ltr' | 'rtl'

function isRtlChar(code: number): boolean {
  return (
    (code >= 0x0590 && code <= 0x05ff) ||
    (code >= 0x0600 && code <= 0x06ff) ||
    (code >= 0x0750 && code <= 0x077f) ||
    (code >= 0x08a0 && code <= 0x08ff) ||
    (code >= 0xfb50 && code <= 0xfdff) ||
    (code >= 0xfe70 && code <= 0xfeff)
  )
}

function isLtrChar(code: number): boolean {
  return (
    (code >= 0x0041 && code <= 0x005a) ||
    (code >= 0x0061 && code <= 0x007a) ||
    (code >= 0x00c0 && code <= 0x024f)
  )
}

/** Detect reading direction from message content (not UI locale). */
export function detectTextDirection(
  text: string | null | undefined,
  fallback: TextDirection = 'ltr',
): TextDirection {
  const value = String(text ?? '').trim()
  if (!value) return fallback

  let rtl = 0
  let ltr = 0

  for (const char of value) {
    const code = char.charCodeAt(0)
    if (isRtlChar(code)) rtl++
    else if (isLtrChar(code)) ltr++
  }

  if (rtl === 0 && ltr === 0) return fallback
  return rtl >= ltr ? 'rtl' : 'ltr'
}
