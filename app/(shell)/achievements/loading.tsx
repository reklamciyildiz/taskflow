import { Skeleton } from '@/components/ui/skeleton';

export default function AchievementsLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-border p-6">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>

      {/* Category sections */}
      {Array.from({ length: 5 }).map((_, s) => (
        <section key={s}>
          {/* Section header */}
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>

          {/* Achievement cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: s === 0 ? 4 : s === 2 ? 4 : 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-border p-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="ml-auto h-3 w-8" />
                  </div>
                  <Skeleton className="h-3 w-40" />
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-10" />
                      <Skeleton className="h-3 w-8" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
