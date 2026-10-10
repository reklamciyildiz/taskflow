'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTaskContext } from '@/components/TaskContext';
import type { ProcessPropertyData, PropertyCommand } from '@/lib/process-properties';

const changedEvent = 'axiom:process-properties-changed';
// In-flight request coalescing only, not another persisted content store.
const requests = new Map<string, Promise<ProcessPropertyData>>();
const writes = new Set<string>();
async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Properties could not be saved');
  return json;
}
export function useProcessProperties(projectId: string | null | undefined, teamId: string | null | undefined) {
  const { organizationId, currentUser } = useTaskContext();
  const key = projectId && teamId && organizationId && currentUser?.id
    ? `${organizationId}:${currentUser.id}:${teamId}:${projectId}` : '';
  const url = `/api/projects/${projectId}/properties?teamId=${encodeURIComponent(teamId ?? '')}`;
  const [state, setState] = useState<{ key: string; data?: ProcessPropertyData; error?: string }>({ key: '' });
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const currentKey = useRef(key);
  currentKey.current = key;
  const reload = useCallback(async () => {
    if (!key) return;
    const version = ++revision.current;
    let request = requests.get(key);
    if (!request) {
      request = jsonRequest(url).then(result => result.data as ProcessPropertyData);
      requests.set(key, request);
      const pending = request;
      void request.finally(() => { if (requests.get(key) === pending) requests.delete(key); }).catch(() => {});
    }
    try {
      const data = await request;
      if (currentKey.current === key && version === revision.current) setState({ key, data });
    } catch (error) {
      if (currentKey.current === key && version === revision.current) {
        setState(previous => ({ key, data: previous.key === key ? previous.data : undefined,
          error: error instanceof Error ? error.message : 'Properties unavailable' }));
      }
    }
  }, [key, url]);
  useEffect(() => {
    setBusy(false);
    void reload();
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === key) void reload(); };
    const focus = () => { void reload(); };
    window.addEventListener(changedEvent, changed);
    window.addEventListener('focus', focus);
    return () => { revision.current++; window.removeEventListener(changedEvent, changed); window.removeEventListener('focus', focus); };
  }, [key, reload]);
  const write = useCallback(async (writeKey: string, endpoint: string, method: string, payload: unknown) => {
    if (!key || writes.has(writeKey)) throw new Error('A property change is already being saved.');
    writes.add(writeKey); setBusy(true);
    try {
      await jsonRequest(endpoint, { method, body: JSON.stringify(payload) });
      requests.delete(key);
      window.dispatchEvent(new CustomEvent(changedEvent, { detail: key }));
      await reload();
    } finally { writes.delete(writeKey); if (currentKey.current === key) setBusy(false); }
  }, [key, reload]);
  return {
    data: state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : undefined,
    loading: !!key && (state.key !== key || (!state.data && !state.error)), busy,
    reload,
    mutate: (command: PropertyCommand) => write(`${key}:definitions`, url, 'POST', command),
    setValue: (taskId: string, propertyId: string, optionId: string | null) =>
      write(`${key}:${taskId}:${propertyId}`, `/api/tasks/${taskId}/properties`, 'PUT', { propertyId, optionId }),
  };
}
