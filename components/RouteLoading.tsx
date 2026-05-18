'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function RouteLoading({ label: _label }: { label: string }) {
  return (
    <div
      className="w-full space-y-4 p-4 sm:p-6"
      role="status"
      aria-label="Loading"
      aria-live="polite"
    >
      {/* Toolbar placeholder */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-36 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      {/* Content rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${70 + (i % 3) * 10}%` }} />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}
