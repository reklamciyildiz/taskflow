/** Query keys used only for DB / cron dedupe; never needed for navigation or display. */
const INTERNAL_DEDUPE_QUERY_KEYS = ['r', 'w', 'b'] as const;

const DUMMY_ORIGIN = 'http://localhost';

/**
 * Strip internal dedupe query keys from a notification `link`.
 * Safe on server and client (no `window`); relative paths use a dummy base — only pathname/search/hash matter.
 */
export function canonicalNotificationLink(link: string | null | undefined): string | null {
  if (link == null || typeof link !== 'string') return null;
  const s = link.trim();
  if (!s) return null;
  try {
    const u =
      s.startsWith('http://') || s.startsWith('https://')
        ? new URL(s)
        : new URL(s.startsWith('/') ? s : `/${s}`, DUMMY_ORIGIN);
    for (const key of INTERNAL_DEDUPE_QUERY_KEYS) {
      u.searchParams.delete(key);
    }
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return s.startsWith('/') ? s : `/${s}`;
  }
}

/** Same as {@link canonicalNotificationLink}; kept for call sites that frame this as “nav prep”. */
export const notificationLinkForNavigation = canonicalNotificationLink;
