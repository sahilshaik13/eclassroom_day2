"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

const DropdownMenu = ({ children }: any) => {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    return (
        <div ref={ref} className="relative inline-block text-left">
            {React.Children.map(children, (child) => {
                if (React.isValidElement(child)) {
                    // @ts-ignore
                    if (child.type === DropdownMenuTrigger) {
                        // @ts-ignore
                        return React.cloneElement(child, { onClick: () => setOpen(!open) });
                    }
                    // @ts-ignore
                    if (child.type === DropdownMenuContent) {
                        return open ? child : null;
                    }
                }
                return child;
            })}
        </div>
    )
}

const DropdownMenuTrigger = ({ asChild, children, onClick }: any) => {
    return React.cloneElement(children, { onClick });
}

const DropdownMenuContent = ({ align, children }: any) => (
    <div className={cn(
        "absolute z-50 mt-2 min-w-[10rem] overflow-hidden rounded-lg border bg-white p-1 shadow-lg",
        align === "end" ? "right-0" : "left-0"
    )}>
        {children}
    </div>
)

const DropdownMenuCheckboxItem = ({ children, checked, onCheckedChange, onSelect }: any) => (
    <div
        className="relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm transition-colors hover:bg-slate-100"
        onClick={() => {
            if (onCheckedChange) onCheckedChange(!checked);
            if (onSelect) onSelect();
        }}
    >
        <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
            {checked && <Check className="h-3.5 w-3.5 text-slate-900" />}
        </span>
        {children}
    </div>
)

export {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
}
