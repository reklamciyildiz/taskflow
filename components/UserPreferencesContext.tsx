'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DEFAULT_USER_WORKSPACE_PREFERENCES,
  type ActionPanelTabOrder,
  type UserWorkspacePreferences,
} from '@/lib/user-preferences';

export type PreferencesContextValue = UserWorkspacePreferences & {
  loading: boolean;
  actionPanelTabOrderByTask: Record<string, ActionPanelTabOrder>;
  loadActionPanelTabOrder: (taskId: string) => Promise<void>;
  setActionPanelTabOrder: (taskId: string, order: ActionPanelTabOrder) => Promise<boolean>;
  setProcessOrder: (teamId: string, projectIds: string[]) => Promise<boolean>;
};

const fallback: PreferencesContextValue = {
  ...DEFAULT_USER_WORKSPACE_PREFERENCES,
  loading: false,
  actionPanelTabOrderByTask: {},
  loadActionPanelTabOrder: async () => undefined,
  setActionPanelTabOrder: async () => false,
  setProcessOrder: async () => false,
};
const UserPreferencesContext = createContext<PreferencesContextValue>(fallback);

export function UserPreferencesRuntimeProvider({
  value,
  children,
}: {
  value: PreferencesContextValue;
  children: React.ReactNode;
}) {
  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

async function requestPreferences<T = UserWorkspacePreferences>(init?: RequestInit, taskId?: string) {
  const url = taskId
    ? `/api/users/preferences?taskId=${encodeURIComponent(taskId)}`
    : '/api/users/preferences';
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new Error(body?.error || 'Could not save preferences');
  return body.data as T;
}

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_USER_WORKSPACE_PREFERENCES);
  const [actionPanelTabOrderByTask, setActionPanelTabOrderByTask] = useState<Record<string, ActionPanelTabOrder>>({});
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const loadedTaskPreferences = useRef(new Set<string>());
  const taskPreferenceLoads = useRef(new Map<string, Promise<void>>());
  const tabRevisions = useRef(new Map<string, number>());
  const processRevisions = useRef(new Map<string, number>());
  const tabWriteTails = useRef(new Map<string, Promise<unknown>>());
  const processWriteTail = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    mounted.current = true;
    void requestPreferences()
      .then((data) => mounted.current && setPreferences(data))
      .catch(() => undefined)
      .finally(() => mounted.current && setLoading(false));
    return () => { mounted.current = false; };
  }, []);

  const loadActionPanelTabOrder = useCallback(async (taskId: string) => {
    if (loadedTaskPreferences.current.has(taskId)) return;
    const active = taskPreferenceLoads.current.get(taskId);
    if (active) return active;
    const revisionAtStart = tabRevisions.current.get(taskId) ?? 0;
    const request = requestPreferences<{ actionPanelTabOrder: ActionPanelTabOrder }>(undefined, taskId)
      .then((data) => {
        if (!mounted.current) return;
        if ((tabRevisions.current.get(taskId) ?? 0) === revisionAtStart) {
          setActionPanelTabOrderByTask((current) => ({
            ...current,
            [taskId]: data.actionPanelTabOrder,
          }));
        }
        loadedTaskPreferences.current.add(taskId);
      })
      .catch(() => undefined)
      .finally(() => taskPreferenceLoads.current.delete(taskId));
    taskPreferenceLoads.current.set(taskId, request);
    return request;
  }, []);

  const setActionPanelTabOrder = useCallback(async (taskId: string, order: ActionPanelTabOrder) => {
    const revision = (tabRevisions.current.get(taskId) ?? 0) + 1;
    tabRevisions.current.set(taskId, revision);
    let previous: ActionPanelTabOrder = 'checklist_first';
    setActionPanelTabOrderByTask((current) => {
      previous = current[taskId] ?? 'checklist_first';
      return { ...current, [taskId]: order };
    });
    loadedTaskPreferences.current.add(taskId);
    try {
      const tail = tabWriteTails.current.get(taskId) ?? Promise.resolve();
      const write = tail.catch(() => undefined).then(() =>
        requestPreferences({
          method: 'PATCH',
          body: JSON.stringify({ taskId, actionPanelTabOrder: order }),
        }),
      );
      tabWriteTails.current.set(taskId, write);
      await write;
      return true;
    } catch (error) {
      if (tabRevisions.current.get(taskId) === revision) {
        setActionPanelTabOrderByTask((current) => ({ ...current, [taskId]: previous }));
      }
      toast.error(error instanceof Error ? error.message : 'Could not save tab order');
      return false;
    }
  }, []);

  const setProcessOrder = useCallback(async (teamId: string, projectIds: string[]) => {
    const revision = (processRevisions.current.get(teamId) ?? 0) + 1;
    processRevisions.current.set(teamId, revision);
    let previous: string[] = [];
    setPreferences((current) => {
      previous = current.processOrderByTeam[teamId] ?? [];
      return {
        ...current,
        processOrderByTeam: { ...current.processOrderByTeam, [teamId]: projectIds },
      };
    });
    try {
      const write = processWriteTail.current.catch(() => undefined).then(() =>
        requestPreferences({ method: 'PATCH', body: JSON.stringify({ teamId, processOrder: projectIds }) }),
      );
      processWriteTail.current = write;
      await write;
      return true;
    } catch (error) {
      if (processRevisions.current.get(teamId) === revision) {
        setPreferences((current) => ({
          ...current,
          processOrderByTeam: { ...current.processOrderByTeam, [teamId]: previous },
        }));
      }
      toast.error(error instanceof Error ? error.message : 'Could not save process order');
      return false;
    }
  }, []);

  return (
    <UserPreferencesContext.Provider value={{
      ...preferences,
      loading,
      actionPanelTabOrderByTask,
      loadActionPanelTabOrder,
      setActionPanelTabOrder,
      setProcessOrder,
    }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export const useUserPreferences = () => useContext(UserPreferencesContext);
