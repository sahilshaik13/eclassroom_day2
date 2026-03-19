"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const DialogContext = React.createContext<{ open: boolean; onOpenChange: (open: boolean) => void } | null>(null);

const Dialog = ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) => {
    return (
        <DialogContext.Provider value={{ open, onOpenChange }}>
            {children}
        </DialogContext.Provider>
    );
};

const DialogTrigger = ({ children, asChild }: { children: React.ReactElement; asChild?: boolean }) => {
    const context = React.useContext(DialogContext);
    if (!context) return children;

    return React.cloneElement(children as any, {
        onClick: (e: React.MouseEvent) => {
            const props = (children as any).props;
            if (props && props.onClick) props.onClick(e);
            context.onOpenChange(true);
        }
    });
};

const DialogContent = ({ className, children }: { className?: string; children: React.ReactNode }) => {
    const context = React.useContext(DialogContext);
    if (!context?.open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="fixed inset-0" onClick={() => context.onOpenChange(false)} />
            <div
                className={cn(
                    "relative z-50 grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-2xl animate-in fade-in zoom-in-95",
                    className
                )}
            >
                {children}
            </div>
        </div>
    )
}

const DialogHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col space-y-1.5 text-center sm:text-left",
            className
        )}
        {...props}
    />
)

const DialogFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
            className
        )}
        {...props}
    />
)

const DialogTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h3
        ref={ref}
        className={cn(
            "text-lg font-semibold leading-none tracking-tight",
            className
        )}
        {...props}
    />
))
DialogTitle.displayName = "DialogTitle"

export {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
}
