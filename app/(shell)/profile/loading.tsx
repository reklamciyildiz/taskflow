import { Skeleton } from '@/components/ui/skeleton';

export default function ProfileLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Avatar + name section */}
      <div className="flex items-center gap-4 rounded-xl border border-border p-5">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      {/* Form fields */}
      <div className="space-y-4 rounded-xl border border-border p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-px w-full" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
    </div>
  );
}
