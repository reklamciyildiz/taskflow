'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Task } from '@/lib/types';
import {
  TASK_DEPENDENCIES_CHANGED_EVENT,
  type TeamDependencySummary,
} from '@/lib/task-dependency-ui';

type Snapshot = { teamId: string | null; data: TeamDependencySummary; loading: boolean; error: boolean };
const EMPTY: TeamDependencySummary = {};

/** Shared request pattern for Board and List; no API call per Action/card. */
export function useTeamDependencySummary(teamId: string | undefined, tasks: readonly Task[]) {
  // Refresh when local Action statuses change, even if links did not change.
  // Also refresh on focus to pick up another teammate's completed blocker.
  const statusKey = useMemo(
    () => tasks.filter(task => task.teamId === teamId)
      .map(task => task.id + ':' + task.status + ':' + (task.projectId ?? '')).sort().join('|'),
    [tasks, teamId],
  );
  const [snapshot, setSnapshot] = useState<Snapshot>({
    teamId: null, data: EMPTY, loading: true, error: false,
  });
  useEffect(() => {
    if (!teamId) {
      setSnapshot({ teamId: null, data: EMPTY, loading: false, error: false });
      return;
    }
    let active = true;
    let revision = 0;
    let controller: AbortController | null = null;
    async function refresh() {
      if (!teamId || !active) return;
      const current = ++revision;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch('/api/tasks/dependency-summary?teamId=' + encodeURIComponent(teamId), {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Dependency summary request failed');
        const result = await response.json();
        if (!result?.success || !result.data || typeof result.data !== 'object') {
          throw new Error('Invalid dependency summary');
        }
        if (active && current === revision) {
          setSnapshot({ teamId, data: result.data as TeamDependencySummary, loading: false, error: false });
        }
      } catch (error) {
        if (active && current === revision && (error as Error).name !== 'AbortError') {
          // Fail closed: never display a stale 'ready' badge after a failed refresh.
          setSnapshot({ teamId, data: EMPTY, loading: false, error: true });
        }
      }
    }
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ teamId?: string }>).detail;
      if (detail?.teamId === teamId) void refresh();
    };
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    setSnapshot(current => current.teamId === teamId
      ? current : { teamId, data: EMPTY, loading: true, error: false });
    void refresh();
    window.addEventListener(TASK_DEPENDENCIES_CHANGED_EVENT, onChange);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener(TASK_DEPENDENCIES_CHANGED_EVENT, onChange);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [teamId, statusKey]);

  const current = snapshot.teamId === teamId
    ? snapshot : { teamId: teamId ?? null, data: EMPTY, loading: true, error: false };
  return { items: current.data, loading: current.loading, error: current.error };
}
