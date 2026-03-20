import React from 'react';
import { cn } from '@/lib/utils';

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
  return (
    <div className={cn('space-y-6 animate-in fade-in duration-500 pb-24 md:pb-8', className)}>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          {description && (
            <p className="text-slate-500 text-sm mt-0.5">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap">
            {actions}
          </div>
        )}
      </div>

      {/* Page Content */}
      <div className="relative">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none -z-10" />
        {children}
      </div>
    </div>
  );
}
