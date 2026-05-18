import { Skeleton } from '@/components/ui/skeleton';

export default function AchievementsLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Skeleton className="h-7 w-40" />

      {/* Progress bar area */}
      <div className="space-y-3 rounded-xl border border-border p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-3 w-20" />
      </div>

      {/* Achievement cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
