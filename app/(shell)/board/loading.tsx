import { Skeleton } from '@/components/ui/skeleton';

// Board skeleton — 4 kanban columns, each with a few task cards
export default function BoardLoading() {
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4 sm:p-6">
      {Array.from({ length: 4 }).map((_, col) => (
        <div
          key={col}
          className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3"
        >
          {/* Column header */}
          <div className="flex items-center justify-between px-1 py-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>

          {/* Task cards */}
          {Array.from({ length: col === 0 ? 4 : col === 1 ? 3 : col === 2 ? 2 : 1 }).map((_, card) => (
            <div key={card} className="space-y-2 rounded-lg border border-border bg-background p-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <div className="flex items-center gap-2 pt-1">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </div>
            </div>
          ))}

          {/* Add card ghost */}
          <Skeleton className="mt-1 h-8 w-full rounded-lg opacity-50" />
        </div>
      ))}
    </div>
  );
}
