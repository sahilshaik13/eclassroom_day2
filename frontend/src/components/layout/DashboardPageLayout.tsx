import React from 'react';
import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';

interface DashboardPageLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function DashboardPageLayout({
  children,
  title,
  description,
  actions,
  className
}: DashboardPageLayoutProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={cn(
        // Outer PortalLayout main already applies pb-20 on mobile for the tab bar — avoid stacking extra page padding.
        'app-page space-y-4 sm:space-y-5 pb-1 md:pb-4',
        className,
      )}
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          {description && (
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5 max-w-3xl">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap sm:justify-end">
            {actions}
          </div>
        )}
      </div>

      {/* Page Content */}
      <div className="app-section relative overflow-x-clip">
        <div className="absolute -top-20 -left-20 w-64 h-64 sm:w-80 sm:h-80 bg-primary/5 rounded-full blur-[90px] pointer-events-none -z-10" />
        {children}
      </div>
    </motion.div>
  );
}
