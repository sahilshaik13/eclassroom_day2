"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

type DropdownMenuContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null)

function useDropdownMenu() {
  const ctx = React.useContext(DropdownMenuContext)
  if (!ctx) throw new Error("DropdownMenu components must be used within DropdownMenu")
  return ctx
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === "function") ref(node)
      else (ref as React.MutableRefObject<T | null>).current = node
    }
  }
}

const DropdownMenu = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const contentRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (contentRef.current?.contains(target)) return
      setOpen(false)
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  const value = React.useMemo(
    () => ({ open, setOpen, triggerRef, contentRef }),
    [open],
  )

  return (
    <DropdownMenuContext.Provider value={value}>
      <div className="relative block w-full min-w-0 text-left">{children}</div>
    </DropdownMenuContext.Provider>
  )
}

const DropdownMenuTrigger = ({
  asChild: _asChild,
  children,
  onClick,
}: {
  asChild?: boolean
  children: React.ReactElement<{ onClick?: React.MouseEventHandler; ref?: React.Ref<HTMLElement> }>
  onClick?: React.MouseEventHandler
}) => {
  const { open, setOpen, triggerRef } = useDropdownMenu()
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      onClick?.(e)
      children.props.onClick?.(e)
      setOpen(!open)
    },
    ref: mergeRefs(children.props.ref, triggerRef),
  })
}

const DropdownMenuContent = ({
  align = "start",
  children,
  className,
}: {
  align?: "start" | "end"
  children: React.ReactNode
  className?: string
}) => {
  const { open, triggerRef, contentRef } = useDropdownMenu()
  const [coords, setCoords] = React.useState({ top: 0, left: 0 })

  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setCoords({
      top: rect.bottom + 8,
      left: align === "end" ? rect.right : rect.left,
    })
  }, [open, align, triggerRef])

  if (!open) return null

  return createPortal(
    <div
      ref={contentRef}
      className={cn(
        "fixed z-[200] min-w-[10rem] overflow-hidden rounded-lg border bg-white p-1 shadow-lg",
        align === "end" && "-translate-x-full",
        className,
      )}
      style={{ top: coords.top, left: coords.left }}
    >
      {children}
    </div>,
    document.body,
  )
}

const DropdownMenuCheckboxItem = ({
  children,
  checked,
  onCheckedChange,
  onSelect,
}: {
  children: React.ReactNode
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  onSelect?: () => void
}) => (
  <div
    className="relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm transition-colors hover:bg-slate-100"
    onClick={() => {
      onCheckedChange?.(!checked)
      onSelect?.()
    }}
  >
    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
      {checked && <Check className="h-3.5 w-3.5 text-slate-900" />}
    </span>
    {children}
  </div>
)

const DropdownMenuItem = ({
  className,
  children,
  onClick,
  disabled,
}: {
  className?: string
  children: React.ReactNode
  onClick?: React.MouseEventHandler
  disabled?: boolean
}) => (
  <div
    className={cn(
      "relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-slate-100",
      disabled && "pointer-events-none opacity-50",
      className,
    )}
    onClick={disabled ? undefined : onClick}
  >
    {children}
  </div>
)

const DropdownMenuSeparator = () => <div className="my-1 h-px bg-slate-100" />

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
}
