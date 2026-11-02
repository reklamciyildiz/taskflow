import { Skeleton } from '@/components/ui/skeleton';

/** Match the real workspace hierarchy to avoid a large layout shift on navigation. */
export default function KnowledgeHubLoading() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-3 pb-14 pt-2 sm:px-5 lg:px-8" aria-label="Loading Knowledge Hub">
      <div className="flex min-h-[220px] flex-col justify-between gap-6 rounded-[26px] border border-[#283a56] bg-[#101d30] p-6 sm:flex-row sm:items-center sm:p-8">
        <div className="space-y-3">
          <Skeleton className="h-3 w-36 bg-white/15" />
          <Skeleton className="h-10 w-64 max-w-full bg-white/15" />
          <Skeleton className="h-4 w-72 max-w-full bg-white/15" />
          <Skeleton className="h-10 w-40 bg-white/15" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Skeleton className="h-28 w-28 rounded-2xl bg-white/10" />
          <Skeleton className="h-28 w-28 rounded-2xl bg-white/10" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-[19px] border border-border/70 bg-card p-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2"><Skeleton className="h-5 w-10" /><Skeleton className="h-3 w-20" /></div>
          </div>
        ))}
      </div>
      <div className="space-y-4 rounded-[24px] border border-border/70 bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-11 flex-1 rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl sm:w-48" />
          <Skeleton className="h-11 w-full rounded-xl sm:w-36" />
        </div>
        <Skeleton className="h-9 w-full max-w-xl rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="space-y-4 rounded-[21px] border border-border/70 bg-card p-5">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
