"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, Check } from "lucide-react"

const SelectContext = React.createContext<{
    value: string;
    onValueChange: (value: string) => void;
    open: boolean;
    setOpen: (open: boolean) => void;
}>({ value: "", onValueChange: () => { }, open: false, setOpen: () => { } });

const Select = ({ value, onValueChange, children }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
}) => {
    const [selectedValue, setSelectedValue] = React.useState(value || "");
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    // Sync internal state with controlled value
    React.useEffect(() => {
        if (value !== undefined) setSelectedValue(value);
    }, [value]);

    // Close on click outside
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <SelectContext.Provider value={{
            value: value !== undefined ? value : selectedValue,
            onValueChange: (val: string) => {
                if (onValueChange) onValueChange(val);
                else setSelectedValue(val);
                setOpen(false);
            },
            open,
            setOpen
        }}>
            <div ref={ref} className="relative inline-block w-full">{children}</div>
        </SelectContext.Provider>
    )
}

const SelectTrigger = ({ className, children }: {
    className?: string;
    children: React.ReactNode;
}) => {
    const { setOpen, open } = React.useContext(SelectContext);
    return (
        <button
            type="button"
            onClick={() => setOpen(!open)}
            className={cn(
                "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
                className
            )}
        >
            {children}
            <ChevronDown className={cn("ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")} />
        </button>
    )
}

const SelectValue = ({ placeholder, children }: { placeholder?: string; children?: React.ReactNode }) => {
    const { value } = React.useContext(SelectContext);
    const hasValue = value && value !== "all";
    return (
        <span className={cn("truncate", !hasValue && "text-muted-foreground")}>
            {children || (hasValue ? value : placeholder)}
        </span>
    );
}

const SelectContent = ({ children, className }: { children: React.ReactNode; className?: string }) => {
    const { open } = React.useContext(SelectContext);
    if (!open) return null;
    return (
        <div className={cn("absolute top-[calc(100%+4px)] left-0 z-50 w-full min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95", className)}>
            <div className="p-1 max-h-[200px] overflow-y-auto">
                {children}
            </div>
        </div>
    )
}

const SelectItem = ({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) => {
    const { onValueChange, value: selectedValue } = React.useContext(SelectContext);
    const isSelected = selectedValue === value;
    return (
        <div
            className={cn(
                "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                isSelected && "bg-accent/50",
                className
            )}
            onClick={() => onValueChange(value)}
        >
            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {isSelected && <Check className="h-3.5 w-3.5" />}
            </span>
            <span className="truncate">{children}</span>
        </div>
    )
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
