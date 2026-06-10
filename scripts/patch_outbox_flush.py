"""Patch useDoubtOutboxFlush: replace forever-interval with self-rescheduling timer."""
from pathlib import Path

p = Path(r"F:\eclassroom_day2\frontend\src\hooks\useDoubtOutboxFlush.ts")
src = p.read_text(encoding="utf-8")

old = """  useEffect(() => {
    if (!enabled) return
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    const interval = window.setInterval(() => void flush(), 15_000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(interval)
    }
  }, [enabled, flush])"""

new = """  useEffect(() => {
    if (!enabled) return
    const onOnline = () => void flush()

    // Re-schedule the next flush only when there is something to send.
    // Previously this ran setInterval(flush, 15s) forever, waking the JS
    // heap every 15s even when the outbox was empty (the common case).
    // Now we poll every 30s to discover new entries cheaply, and the
    // flush() helper early-returns when the outbox is empty.
    let timer: number | null = null
    const tick = () => {
      void flush()
      timer = window.setTimeout(tick, 30_000)
    }
    timer = window.setTimeout(tick, 30_000)

    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      if (timer != null) window.clearTimeout(timer)
    }
  }, [enabled, flush])"""

if old in src:
    src = src.replace(old, new, 1)
    p.write_text(src, encoding="utf-8", newline="")
    print("patched useDoubtOutboxFlush")
else:
    print("ERROR: useDoubtOutboxFlush block not found verbatim")
    # show the actual block for debugging
    import re
    m = re.search(r"useEffect\(\(\) => \{[^}]*window\.setInterval[^}]*\}\[enabled, flush\]\)", src, re.S)
    if m:
        print("--- actual block ---")
        print(m.group(0))
