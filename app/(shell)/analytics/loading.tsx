import { Skeleton } from '@/components/ui/skeleton';

// Analytics skeleton — stat cards row + chart areas
export default function AnalyticsLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Page title */}
      <Skeleton className="h-7 w-36" />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Primary chart */}
      <div className="space-y-3 rounded-xl border border-border p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-52 w-full rounded-lg" />
      </div>

      {/* Secondary charts — 2 col */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-36 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
