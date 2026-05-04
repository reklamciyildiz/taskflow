/**
 * In-app notifications may persist internal dedupe query keys (`r`, `w`, `b`) on `link`
 * for database uniqueness. Strip them before client navigation so deep links match the
 * normal board/list URLs and avoid extra rerender / “full restart” feel.
 */
export function notificationLinkForNavigation(link: string | null | undefined): string | null {
  if (link == null || typeof link !== 'string') return null;
  const s = link.trim();
  if (!s) return null;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const u = s.startsWith('http://') || s.startsWith('https://') ? new URL(s) : new URL(s, origin);
    for (const key of ['r', 'w', 'b']) {
      u.searchParams.delete(key);
    }
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return s.startsWith('/') ? s : `/${s}`;
  }
}
