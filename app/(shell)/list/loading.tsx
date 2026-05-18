import { Skeleton } from '@/components/ui/skeleton';

// List skeleton — filter bar + grouped task rows
export default function ListLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Filter / toolbar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="ml-auto h-9 w-28 rounded-lg" />
      </div>

      {/* Group headers + rows */}
      {Array.from({ length: 3 }).map((_, group) => (
        <div key={group} className="space-y-1">
          {/* Group label */}
          <div className="flex items-center gap-2 py-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-6 rounded-full" />
          </div>

          {/* Task rows */}
          {Array.from({ length: group === 0 ? 5 : group === 1 ? 4 : 3 }).map((_, row) => (
            <div
              key={row}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
            >
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
