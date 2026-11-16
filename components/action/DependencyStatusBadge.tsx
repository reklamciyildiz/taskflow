'use client';
import { CircleCheck, GitBranch, LockKeyhole } from 'lucide-react';
import { useAppLocale } from '@/components/i18n/AppLocaleProvider';
import { cn } from '@/lib/utils';
import type { TaskDependencyFlags } from '@/lib/task-dependency-ui';

/** Small, accessible relation chips; never imply readiness when the API is unavailable. */
export function DependencyStatusBadge({
  flags, compact = false,
}: {
  flags?: TaskDependencyFlags;
  compact?: boolean;
}) {
  const { t } = useAppLocale();
  if (!flags || (!flags.blocked && !flags.ready && !flags.blocking)) return null;
  const base = cn(
    'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold leading-none',
    compact && 'px-1.5 py-0.5',
  );
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1" data-dependency-badges>
      {flags.blocked && (
        <span className={cn(base, 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300')}
          role="status" title={t('Waiting for unfinished prerequisite Actions')}
          aria-label={t('Blocked by unfinished Actions')} data-dependency-blocked>
          <LockKeyhole className="h-3 w-3 shrink-0" aria-hidden />
          {t('Blocked')}
        </span>
      )}
      {flags.ready && (
        <span className={cn(base, 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}
          title={t('All prerequisite Actions are completed')} aria-label={t('Ready to proceed')} data-dependency-ready>
          <CircleCheck className="h-3 w-3 shrink-0" aria-hidden />
          {t('Ready')}
        </span>
      )}
      {flags.blocking && (
        <span className={cn(base, 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300')}
          title={t('Other Actions depend on this Action')} aria-label={t('Blocking other Actions')} data-dependency-blocking>
          <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
          {t('Blocking')}
        </span>
      )}
    </span>
  );
}
