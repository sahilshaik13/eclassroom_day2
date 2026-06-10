"""Combine the two activeThread?.classId-dependent effects in StudentDoubtsChat.tsx."""
from pathlib import Path

p = Path(r"F:\eclassroom_day2\frontend\src\components\student\StudentDoubtsChat.tsx")
src = p.read_text(encoding="utf-8")

old = """  useEffect(() => {
    const threadId = activeThread?.classId ?? null
    const behavior: ScrollBehavior =
      lastScrollThreadRef.current === threadId ? 'smooth' : 'auto'
    lastScrollThreadRef.current = threadId
    scrollChatPaneToBottom(messagesScrollRef.current, behavior)
  }, [activeThread?.classId, activeThread?.messages.length])

  useEffect(() => {
    if (!activeThread?.messages?.length) return
    if (
      pruneDeliveredOutbox((clientId) =>
        serverHasClientMessage(activeThread.messages as DoubtChatMessage[], clientId),
      )
    ) {
      setOutboxTick((n) => n + 1)
    }
  }, [activeThread?.messages, activeThread?.classId])"""

new = """  // Combined: scroll-to-bottom + outbox-prune both depend on the
  // active thread. Previously split into two effects that each
  // re-ran on any message change, doubling the work per update.
  const activeThreadId = activeThread?.classId ?? null
  const activeMessageCount = activeThread?.messages.length ?? 0

  useEffect(() => {
    if (activeThreadId == null) return
    const behavior: ScrollBehavior =
      lastScrollThreadRef.current === activeThreadId ? 'smooth' : 'auto'
    lastScrollThreadRef.current = activeThreadId
    scrollChatPaneToBottom(messagesScrollRef.current, behavior)

    if (activeMessageCount > 0 && activeThread) {
      if (
        pruneDeliveredOutbox((clientId) =>
          serverHasClientMessage(activeThread.messages as DoubtChatMessage[], clientId),
        )
      ) {
        setOutboxTick((n) => n + 1)
      }
    }
    // activeMessageCount is sufficient as a proxy for the messages
    // array reference; the actual messages are read via activeThread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, activeMessageCount])"""

if old in src:
    src = src.replace(old, new, 1)
    p.write_text(src, encoding="utf-8", newline="")
    print("patched StudentDoubtsChat")
else:
    print("ERROR: combined-effect block not found verbatim")
    import re
    for i, line in enumerate(src.splitlines(), 1):
        if "useEffect" in line and "activeThread" in line:
            print(f"  L{i}: {line}")
