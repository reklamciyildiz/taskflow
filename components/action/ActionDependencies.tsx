'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowRight, CheckCircle2, ChevronDown, GitBranch, Link2,
  Loader2, LockKeyhole, Plus, Search, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTaskContext } from '@/components/TaskContext';
import { useAppLocale } from '@/components/i18n/AppLocaleProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

/** Compact, always discoverable section with a responsive searchable picker. */
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
  const linkedIds = useMemo(() => new Set(
    (picker === 'blockedBy' ? overview?.blockedBy : overview?.blocking)?.map(item => item.taskId) ?? [],
  ), [overview, picker]);
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
      if (!remove) { setPicker(null); setQuery(''); }
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
    <section className="shrink-0 border-b border-border/50 bg-background/60" data-action-dependencies>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <button type="button" aria-label={t('Show Action dependencies')} aria-expanded={expanded}
            className="flex min-h-[48px] w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:px-6">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
              overview?.blocked ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-primary/10 text-primary')}>
              {overview?.blocked ? <LockKeyhole className="h-4 w-4" aria-hidden /> : <GitBranch className="h-4 w-4" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-foreground">{t('Dependencies')}</span>
              <span className="block truncate text-[11px] text-muted-foreground" aria-live="polite">
                {loading ? t('Loading dependencies…') : loadError ? t('Dependencies unavailable') : label}
              </span>
            </span>
            {overview?.blocked && <Badge className="shrink-0 border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              variant="outline">{t('Blocked')}</Badge>}
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} aria-hidden />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="max-h-[min(40dvh,360px)] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          <div className="grid min-w-0 gap-3 px-4 pb-4 md:grid-cols-2 md:px-6" aria-busy={loading}>
            {loadError ? (
              <div className="col-span-full flex items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3">
                <span className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />{t('Could not load dependencies')}
                </span>
                <Button size="sm" type="button" variant="outline" onClick={() => void reload(() => activeRef.current)}>{t('Retry')}</Button>
              </div>
            ) : loading && !overview ? (
              <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('Loading dependencies…')}
              </div>
            ) : (
              <>
                {([
                  { direction: 'blockedBy' as const, title: t('Waiting for'), items: overview?.blockedBy ?? [] },
                  { direction: 'blocking' as const, title: t('Blocks'), items: overview?.blocking ?? [] },
                ]).map(group => (
                  <div key={group.direction} className="min-w-0 space-y-2 rounded-2xl border border-border/55 bg-muted/20 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                        {group.direction === 'blockedBy' ? <LockKeyhole className="h-3.5 w-3.5 text-amber-600" aria-hidden /> : <ArrowRight className="h-3.5 w-3.5 text-primary" aria-hidden />}
                        {group.title} <span className="tabular-nums text-muted-foreground">({group.items.length})</span>
                      </span>
                      {canEdit && <Button type="button" size="sm" variant="outline" disabled={!!pending}
                        className="h-8 gap-1 rounded-lg px-2 text-[11px]"
                        onClick={() => openPicker(group.direction)}>
                        <Plus className="h-3 w-3" aria-hidden />{t('Add')}
                      </Button>}
                    </div>
                    {group.items.length ? (
                      <div className="max-h-40 space-y-1.5 overflow-y-auto [scrollbar-width:thin]">
                        {group.items.map(item =>
                          <RelatedAction key={item.id} item={item} direction={group.direction}
                            editable={canEdit} busy={pending !== null}
                            onOpen={onNavigate} onRemove={(id, direction) => void mutate(direction, id, true)} />
                        )}
                      </div>
                    ) : <p className="rounded-xl border border-dashed border-border/55 px-3 py-4 text-center text-[11px] text-muted-foreground">
                      {t(group.direction === 'blockedBy' ? 'No prerequisites yet' : 'Does not block another Action')}
                    </p>}
                  </div>
                ))}
                {hiddenBlocker && <p className="col-span-full flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-300">
                  <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t('An unfinished prerequisite is in a restricted Process. Contact a teammate with access.')}
                </p>}
                {!canEdit && <p className="col-span-full text-[11px] text-muted-foreground">{t('Read-only: you cannot change dependencies.')}</p>}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={picker !== null} onOpenChange={open => { if (!open) setPicker(null); }}>
        <DialogContent className="flex max-h-[min(88dvh,680px)] w-[min(94vw,540px)] flex-col gap-0 overflow-hidden rounded-[22px] border-border/65 p-0 sm:rounded-[24px]">
          <DialogHeader className="shrink-0 border-b border-border/55 bg-muted/25 px-5 py-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Link2 className="h-4 w-4" aria-hidden /></span>
              {t(picker === 'blockedBy' ? 'Add prerequisite Action' : 'Add dependent Action')}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {t(picker === 'blockedBy'
                ? 'This Action will wait for the selected Action to finish.'
                : 'The selected Action will wait for this Action to finish.')}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-5 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input autoFocus aria-label={t('Search team Actions')} value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={t('Search team Actions…')} className="h-11 rounded-xl pl-10" />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t('Only accessible Actions in the same team can be connected.')}</p>
            <div className="max-h-[min(49dvh,360px)] space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-border/55 bg-muted/15 p-1.5 [scrollbar-width:thin]" aria-busy={!!pending}>
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
          <div className="flex shrink-0 justify-end border-t border-border/55 px-5 py-3">
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => setPicker(null)}>{t('Cancel')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
