'use client';

export function RouteLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[38vh] items-center justify-center p-6" role="status" aria-live="polite">
      <p className="animate-pulse text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
