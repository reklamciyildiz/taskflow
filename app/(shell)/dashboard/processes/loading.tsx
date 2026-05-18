import { Skeleton } from '@/components/ui/skeleton';

export default function ProcessesLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-16 rounded-full ml-auto" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-7 w-20 rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
