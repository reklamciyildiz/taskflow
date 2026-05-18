import { Skeleton } from '@/components/ui/skeleton';

// Customers skeleton — toolbar + table rows
export default function CustomersLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="ml-auto h-9 w-32 rounded-lg" />
      </div>

      {/* Table header */}
      <div className="flex items-center gap-4 rounded-t-lg border border-border bg-muted/40 px-4 py-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="ml-auto h-3 w-20" />
      </div>

      {/* Table rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-x border-b border-border bg-background px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-3 w-44" />
          <Skeleton className="ml-auto h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
