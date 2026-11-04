/** Query keys used for dedupe only, never for destination navigation. */
const INTERNAL_DEDUPE_QUERY_KEYS = [
  'r', 'w', 'b', 'schedule', 'occurrence', 'rule', 'at',
] as const;

const DUMMY_ORIGIN = 'http://localhost';

/** The notification URL must be an in-app path, not an arbitrary external URL. */
export function canonicalNotificationLink(link: string | null | undefined): string | null {
  if (typeof link !== 'string') return null;
  const value = link.trim();
  if (!value || value.startsWith('//') || value.startsWith('\\') ||
      (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value))) return null;
  try {
    const absolute = /^https?:\/\//i.test(value);
    const url = new URL(absolute ? value : value.startsWith('/') ? value : `/${value}`, DUMMY_ORIGIN);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (absolute && ![
      'actiproc.com', 'www.actiproc.com', 'localhost', '127.0.0.1',
    ].includes(url.hostname.toLowerCase())) return null;
    // URL is always returned RELATIVE to the current origin, including for push.
    for (const key of INTERNAL_DEDUPE_QUERY_KEYS) url.searchParams.delete(key);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export const notificationLinkForNavigation = canonicalNotificationLink;

export type NotificationTarget = {
  taskId: string;
  checklistItemId: string | null;
  noteId: string | null;
};

function safeIdentifier(value: string | null): string | null {
  return value && value.length <= 128 && /^[a-z\d_-]+$/i.test(value) ? value : null;
}

/** A deep link names one specific Action and optionally a Note or checklist item. */
export function notificationTargetFromLink(link: string | null | undefined): NotificationTarget | null {
  const destination = canonicalNotificationLink(link);
  if (!destination) return null;
  const url = new URL(destination, DUMMY_ORIGIN);
  if (url.pathname !== '/board') return null;
  const taskId = safeIdentifier(url.searchParams.get('task'));
  if (!taskId) return null;
  return {
    taskId,
    checklistItemId: safeIdentifier(url.searchParams.get('checklist')),
    noteId: safeIdentifier(url.searchParams.get('note')),
  };
}

/** Canonical, percent-encoded Action link shared by in-app and push senders. */
export function actionNotificationLink(input: {
  taskId: string;
  projectId?: string | null;
  checklistItemId?: string | null;
  noteId?: string | null;
}): string {
  const query = new URLSearchParams({ task: input.taskId });
  if (input.projectId) query.set('project', input.projectId);
  if (input.checklistItemId) query.set('checklist', input.checklistItemId);
  if (input.noteId) query.set('note', input.noteId);
  return `/board?${query.toString()}`;
}
