import { Skeleton } from '@/components/ui/skeleton';

// Dashboard (home) skeleton — mirrors QuickCapture + DailyIntent + FocusDashboard + DashboardInsights
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* QuickCapture */}
      <Skeleton className="h-12 w-full rounded-xl" />

      {/* DailyIntent card */}
      <div className="space-y-3 rounded-xl border border-border p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>

      {/* FocusDashboard — 2-col grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>

      {/* DashboardInsights — list rows */}
      <div className="space-y-2 rounded-xl border border-border p-4">
        <Skeleton className="mb-4 h-4 w-36" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <Skeleton className="h-5 w-5 shrink-0 rounded" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
