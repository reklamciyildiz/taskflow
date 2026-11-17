'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, GitBranch, Link2,
  Loader2, LockKeyhole, Plus, Search, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTaskContext } from '@/components/TaskContext';
import { useAppLocale } from '@/components/i18n/AppLocaleProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { taskDependencyApi } from '@/lib/api';
import type { TaskDependencyOverview, TaskDependencyReference, TaskDependencyCommand } from '@/lib/task-dependencies';
import { notifyTaskDependenciesChanged, TASK_DEPENDENCIES_CHANGED_EVENT } from '@/lib/task-dependency-ui';
import { cn } from '@/lib/utils';

type Direction = 'blockedBy' | 'blocking';

function dependencyMessage(code: string | undefined, fallback: string, t: (text: string) => string) {
  const messages: Record<string, string> = {
    DEPENDENCY_BLOCKED: 'Complete the prerequisites before finishing this Action.',
    DEPENDENCY_CYCLE: 'This connection would create a circular dependency.',
    DEPENDENCY_RECURRING: 'Recurring Actions cannot have dependencies yet.',
    DEPENDENCY_TERMINAL_TARGET: 'Reopen the finished Action before adding an unfinished prerequisite.',
    DEPENDENCY_SCOPE: 'Both Actions must belong to the same team.',
    DEPENDENCY_SELF: 'An Action cannot depend on itself.',
    DEPENDENCY_LIMIT: 'The dependency limit has been reached.',
    DEPENDENCY_INBOX_UNSYNCED: 'Synchronize the team Inbox stages before creating dependencies.',
    DEPENDENCY_STAGE_CHANGE: 'This change conflicts with an existing dependency.',
  };
  return code && messages[code] ? t(messages[code]) : fallback;
}

function RelatedAction({
  item, direction, editable, busy, onOpen, onRemove,
}: {
  item: TaskDependencyReference;
  direction: Direction;
  editable: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  onRemove: (peerId: string, direction: Direction) => void;
}) {
  const { t } = useAppLocale();
  return (
    <div className="group flex min-w-0 items-center gap-2 rounded-xl border border-border/55 bg-background/70 px-2.5 py-2 transition-colors hover:border-primary/20">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        item.isTerminal ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
        {item.isTerminal ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <LockKeyhole className="h-4 w-4" aria-hidden />}
      </span>
      <button type="button" onClick={() => onOpen(item.taskId)}
        className="min-w-0 flex-1 text-left focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title={item.title} aria-label={t('Open Action: {title}', { title: item.title } as any)}>
        <span className="block truncate text-xs font-semibold text-foreground hover:text-primary">{item.title}</span>
        <span className="block text-[10px] text-muted-foreground">{t(item.isTerminal ? 'Completed' : 'Not completed')}</span>
      </button>
      {editable && (
        <Button type="button" variant="ghost" size="icon" disabled={busy}
          className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={t('Remove connection with {title}', { title: item.title } as any)}
          title={t('Remove dependency')}
          onClick={() => onRemove(item.taskId, direction)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
        </Button>
      )}
    </div>
  );
}

/** One-line status dock; management opens outside the Action Panel layout. */
export function ActionDependencies({
  taskId, teamId, canEdit, onNavigate,
}: {
  taskId: string;
  teamId: string;
  canEdit: boolean;
  onNavigate: (id: string) => void;
}) {
  const { t } = useAppLocale();
  const { tasks, projects, canEditTask } = useTaskContext();
  const [expanded, setExpanded] = useState(false);
  const [overview, setOverview] = useState<TaskDependencyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [picker, setPicker] = useState<Direction | null>(null);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const activeRef = useRef(true);
  const requestRevisionRef = useRef(0);

  const reload = useCallback(async (isActive: () => boolean) => {
    const revision = ++requestRevisionRef.current;
    setLoading(true);
    let result: Awaited<ReturnType<typeof taskDependencyApi.get>> | null = null;
    try {
      result = await taskDependencyApi.get(taskId);
    } catch {
      // Treat a thrown request as unavailable, not an empty dependency graph.
    }
    // Ignore late responses after an Action switch, unmount or newer refresh.
    if (!isActive() || revision !== requestRevisionRef.current) return;
    if (result?.success && result.data) {
      setOverview(result.data);
      setLoadError(false);
    } else {
      setOverview(null);
      setLoadError(true);
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    let active = true;
    activeRef.current = true;
    const load = () => { void reload(() => active && activeRef.current); };
    load();
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ teamId?: string }>).detail;
      if (detail?.teamId === teamId) load();
    };
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener(TASK_DEPENDENCIES_CHANGED_EVENT, changed);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      activeRef.current = false;
      requestRevisionRef.current += 1;
      window.removeEventListener(TASK_DEPENDENCIES_CHANGED_EVENT, changed);
      window.removeEventListener('focus', onFocus);
    };
  }, [reload, teamId]);

  const projectNames = useMemo(
    () => new Map(projects.map(project => [project.id, project.name])),
    [projects],
  );
  // Do not offer a reverse edge for an already-connected Action: it would form a cycle.
  const linkedIds = useMemo(() => new Set([
    ...(overview?.blockedBy ?? []), ...(overview?.blocking ?? []),
  ].map(item => item.taskId)), [overview]);
  const eligible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return tasks.filter(candidate =>
      candidate.teamId === teamId
      && candidate.id !== taskId
      && candidate.schedule?.scheduleType !== 'recurring'
      && canEditTask(candidate.createdBy, candidate.assigneeId)
      && !linkedIds.has(candidate.id)
      && (!search || [candidate.title, projectNames.get(candidate.projectId ?? '') ?? '']
        .some(text => text.toLocaleLowerCase().includes(search)))
    ).sort((a, b) => a.title.localeCompare(b.title)).slice(0, 75);
  }, [tasks, query, linkedIds, teamId, taskId, canEditTask, projectNames]);

  const mutate = async (direction: Direction, peerId: string, remove = false) => {
    if (!canEdit || pending) return;
    const command: TaskDependencyCommand = direction === 'blockedBy'
      ? { blockerTaskId: peerId } : { blockedTaskId: peerId };
    setPending(peerId);
    try {
      const result = remove
        ? await taskDependencyApi.unlink(taskId, command)
        : await taskDependencyApi.link(taskId, command);
      if (!result.success) {
        toast.error(dependencyMessage(result.code, result.error || t('Could not update dependency'), t));
        return;
      }
      toast.success(t(remove ? 'Dependency removed' : 'Dependency connected'));
      if (!remove) { setPicker(null); setQuery(''); } // Return to dependency overview.
      notifyTaskDependenciesChanged(teamId);
    } catch {
      toast.error(t('Could not update dependency'));
    } finally {
      setPending(null);
    }
  };

  const waiting = overview?.blockedBy.filter(item => !item.isTerminal).length ?? 0;
  const hiddenBlocker = Boolean(overview?.blocked && waiting === 0);
  const hasLinks = Boolean(overview?.blockedBy.length || overview?.blocking.length);
  const label = overview?.blocked
    ? t('Blocked by prerequisites')
    : waiting === 0 && overview?.blockedBy.length
      ? t('Prerequisites completed')
      : hasLinks ? t('Connected work') : t('No dependencies');

  const openPicker = (direction: Direction) => {
    if (pending) return;
    setQuery('');
    setPicker(direction);
  };


  return (
    <section className="shrink-0 border-b border-border/45 bg-background/70" data-action-dependencies>
      {/* Fixed-height status dock: zero layout growth on open, even on small Android screens. */}
      <button
        type="button"
        aria-label={t('Show Action dependencies')}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        onClick={() => setExpanded(true)}
        className="group flex min-h-11 w-full min-w-0 items-center gap-2 px-4 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 md:px-6"
      >
        <span className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
          overview?.blocked ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-primary/10 text-primary',
        )}>
          {overview?.blocked ? <LockKeyhole className="h-3.5 w-3.5" aria-hidden /> : <GitBranch className="h-3.5 w-3.5" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{t('Dependencies')}</span>
        <span className="sr-only" role="status" aria-live="polite">
          {loading ? t('Loading dependencies…') : loadError ? t('Dependencies unavailable') : label}
        </span>
        {loading && !overview ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : loadError ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />{t('Dependencies unavailable')}
          </span>
        ) : (
          <span className="flex min-w-0 shrink-0 items-center gap-1.5" data-dependency-summary>
            {overview?.blocked && (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold leading-none text-amber-700 dark:text-amber-300">
                {t('Blocked')}
              </span>
            )}
            {overview?.blockedBy.length ? (
              <span className="inline-flex h-6 min-w-7 items-center justify-center gap-1 rounded-full border border-border/60 bg-muted/35 px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground"
                aria-label={t('Waiting for') + ': ' + overview.blockedBy.length} title={t('Waiting for')}>
                <LockKeyhole className="h-3 w-3" aria-hidden />{overview.blockedBy.length}
              </span>
            ) : null}
            {overview?.blocking.length ? (
              <span className="inline-flex h-6 min-w-7 items-center justify-center gap-1 rounded-full border border-border/60 bg-muted/35 px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground"
                aria-label={t('Blocks') + ': ' + overview.blocking.length} title={t('Blocks')}>
                <ArrowRight className="h-3 w-3" aria-hidden />{overview.blocking.length}
              </span>
            ) : null}
            {!hasLinks && !overview?.blocked && (
              <span className="max-w-[38vw] truncate text-[11px] text-muted-foreground">{t('No dependencies')}</span>
            )}
          </span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/65 transition-colors group-hover:text-foreground" aria-hidden />
      </button>

      <Dialog open={expanded} onOpenChange={open => {
        if (!open && !pending) { setExpanded(false); setPicker(null); setQuery(''); }
      }}>
        <DialogContent hideClose
          className="flex max-h-[min(88dvh,680px)] w-[min(94vw,560px)] min-w-0 flex-col gap-0 overflow-hidden rounded-[24px] border-border/65 p-0 shadow-2xl max-sm:!bottom-0 max-sm:!left-0 max-sm:!top-auto max-sm:!w-full max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-b-none max-sm:!rounded-t-[24px]"
          data-dependency-dialog>
          <DialogHeader className="shrink-0 border-b border-border/50 bg-gradient-to-b from-muted/40 to-background px-4 py-4 text-left sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              {picker ? (
                <Button type="button" variant="ghost" size="icon" disabled={!!pending}
                  className="h-10 w-10 shrink-0 rounded-xl" aria-label={t('Back')}
                  onClick={() => { setPicker(null); setQuery(''); }}>
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/10 text-primary">
                  <GitBranch className="h-4 w-4" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <DialogTitle className="truncate text-sm font-semibold tracking-tight sm:text-base">
                  {picker ? t(picker === 'blockedBy' ? 'Add prerequisite Action' : 'Add dependent Action') : t('Dependencies')}
                </DialogTitle>
                <DialogDescription className="text-[11px] leading-relaxed sm:text-xs">
                  {picker
                    ? t(picker === 'blockedBy'
                      ? 'This Action will wait for the selected Action to finish.'
                      : 'The selected Action will wait for this Action to finish.')
                    : loading ? t('Loading dependencies…') : loadError ? t('Dependencies unavailable') : label}
                </DialogDescription>
              </div>
              <Button type="button" variant="ghost" size="icon" disabled={!!pending}
                className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
                aria-label={t('Close')} onClick={() => { setExpanded(false); setPicker(null); setQuery(''); }}>
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </DialogHeader>

          {picker ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-4 sm:px-5" data-dependency-picker>
              <div className="relative shrink-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input autoFocus aria-label={t('Search team Actions')} value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder={t('Search team Actions…')} className="h-11 rounded-xl pl-10" />
              </div>
              <p className="shrink-0 text-[11px] leading-relaxed text-muted-foreground">
                {t('Only accessible Actions in the same team can be connected.')}
              </p>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-border/50 bg-muted/15 p-1.5 [scrollbar-width:thin]" aria-busy={!!pending}>
                {eligible.map(candidate => (
                  <button type="button" key={candidate.id} disabled={!!pending}
                    className="group flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-background/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                    onClick={() => picker && void mutate(picker, candidate.id)}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {pending === candidate.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <GitBranch className="h-4 w-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{candidate.title}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {candidate.projectId ? projectNames.get(candidate.projectId) ?? t('Process') : t('Inbox')}
                      </span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                  </button>
                ))}
                {!eligible.length && <div className="px-4 py-10 text-center text-xs text-muted-foreground">{t('No eligible Actions found')}</div>}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4 [scrollbar-width:thin]" aria-busy={loading} data-dependency-manager>
              {loadError ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3" role="alert">
                  <span className="flex min-w-0 items-center gap-2 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />{t('Could not load dependencies')}
                  </span>
                  <Button size="sm" type="button" variant="outline" disabled={loading}
                    className="h-10 shrink-0 rounded-lg" onClick={() => void reload(() => activeRef.current)}>{t('Retry')}</Button>
                </div>
              ) : loading && !overview ? (
                <div className="flex items-center gap-2 px-2 py-8 text-xs text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('Loading dependencies…')}
                </div>
              ) : (
                <>
                  {([
                    { direction: 'blockedBy' as const, title: t('Waiting for'), items: overview?.blockedBy ?? [] },
                    { direction: 'blocking' as const, title: t('Blocks'), items: overview?.blocking ?? [] },
                  ]).map(group => (
                    <div key={group.direction} className="min-w-0 overflow-hidden rounded-2xl border border-border/55 bg-background" data-dependency-group={group.direction}>
                      <div className="flex min-h-12 items-center gap-2 border-b border-border/45 bg-muted/25 px-3 py-1.5">
                        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                          group.direction === 'blockedBy' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-primary/10 text-primary')}>
                          {group.direction === 'blockedBy' ? <LockKeyhole className="h-3.5 w-3.5" aria-hidden /> : <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{group.title}</span>
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{group.items.length}</span>
                        {canEdit && (
                          <Button type="button" variant="ghost" disabled={!!pending}
                            className="h-10 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary"
                            onClick={() => openPicker(group.direction)}>
                            <Plus className="h-3.5 w-3.5" aria-hidden />{t('Add')}
                          </Button>
                        )}
                      </div>
                      {group.items.length ? (
                        <div className="divide-y divide-border/45">
                          {group.items.map(item => (
                            <RelatedAction key={item.id} item={item} direction={group.direction}
                              editable={canEdit} busy={pending !== null}
                              onOpen={onNavigate} onRemove={(id, direction) => void mutate(direction, id, true)} />
                          ))}
                        </div>
                      ) : (
                        <p className="px-3 py-3 text-[11px] text-muted-foreground">
                          {t(group.direction === 'blockedBy' ? 'No prerequisites yet' : 'Does not block another Action')}
                        </p>
                      )}
                    </div>
                  ))}
                  {hiddenBlocker && (
                    <p className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                      <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t('An unfinished prerequisite is in a restricted Process. Contact a teammate with access.')}
                    </p>
                  )}
                  {!canEdit && <p className="px-1 text-[11px] text-muted-foreground">{t('Read-only: you cannot change dependencies.')}</p>}
                </>
              )}
            </div>
          )}
          <div className="h-[max(0px,env(safe-area-inset-bottom))] shrink-0 sm:hidden" aria-hidden />
        </DialogContent>
      </Dialog>
    </section>
  );
}
