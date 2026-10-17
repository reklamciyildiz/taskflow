'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DEFAULT_USER_WORKSPACE_PREFERENCES,
  type ActionPanelTabOrder,
  type UserWorkspacePreferences,
} from '@/lib/user-preferences';

type PreferencesContextValue = UserWorkspacePreferences & {
  loading: boolean;
  setActionPanelTabOrder: (order: ActionPanelTabOrder) => Promise<boolean>;
  setProcessOrder: (teamId: string, projectIds: string[]) => Promise<boolean>;
};

const fallback: PreferencesContextValue = {
  ...DEFAULT_USER_WORKSPACE_PREFERENCES,
  loading: false,
  setActionPanelTabOrder: async () => false,
  setProcessOrder: async () => false,
};
const UserPreferencesContext = createContext<PreferencesContextValue>(fallback);

async function requestPreferences(init?: RequestInit) {
  const response = await fetch('/api/users/preferences', {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new Error(body?.error || 'Could not save preferences');
  return body.data as UserWorkspacePreferences;
}

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_USER_WORKSPACE_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const tabRevision = useRef(0);
  const processRevisions = useRef(new Map<string, number>());
  const tabWriteTail = useRef<Promise<unknown>>(Promise.resolve());
  const processWriteTail = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    mounted.current = true;
    void requestPreferences()
      .then((data) => mounted.current && setPreferences(data))
      .catch(() => undefined)
      .finally(() => mounted.current && setLoading(false));
    return () => { mounted.current = false; };
  }, []);

  const setActionPanelTabOrder = useCallback(async (order: ActionPanelTabOrder) => {
    const revision = ++tabRevision.current;
    let previous: ActionPanelTabOrder = 'checklist_first';
    setPreferences((current) => {
      previous = current.actionPanelTabOrder;
      return { ...current, actionPanelTabOrder: order };
    });
    try {
      const write = tabWriteTail.current.catch(() => undefined).then(() =>
        requestPreferences({ method: 'PATCH', body: JSON.stringify({ actionPanelTabOrder: order }) }),
      );
      tabWriteTail.current = write;
      await write;
      return true;
    } catch (error) {
      if (tabRevision.current === revision)
        setPreferences((current) => ({ ...current, actionPanelTabOrder: previous }));
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
    <UserPreferencesContext.Provider value={{ ...preferences, loading, setActionPanelTabOrder, setProcessOrder }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export const useUserPreferences = () => useContext(UserPreferencesContext);
