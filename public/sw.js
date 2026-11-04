/* eslint-disable no-restricted-globals */

const ACTIPROC_SHELL_CACHE = 'actiproc-shell-v2';
const AXIOM_OFFLINE_URL = '/offline.html';
const ACTIPROC_PUBLIC_SHELL = [
  AXIOM_OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ACTIPROC_SHELL_CACHE).then(async (cache) => {
      // The offline document is the only required entry. Optional branding assets
      // must never prevent a service-worker update from installing.
      await cache.add(new Request(AXIOM_OFFLINE_URL, { cache: 'reload' }));
      await Promise.allSettled(
        ACTIPROC_PUBLIC_SHELL.slice(1).map((url) =>
          cache.add(new Request(url, { cache: 'reload' }))
        )
      );
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => (key.startsWith('axiom-shell-') || key.startsWith('actiproc-shell-')) && key !== ACTIPROC_SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Never cache API calls, authenticated application documents, or user data.
  // Only failed top-level, same-origin navigations receive the static shell.
  if (
    request.method !== 'GET' ||
    request.mode !== 'navigate' ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if ([502, 503, 504].includes(response.status)) {
          return caches.match(AXIOM_OFFLINE_URL).then((fallback) => fallback || response);
        }
        return response;
      })
      .catch(async () => {
        const fallback = await caches.match(AXIOM_OFFLINE_URL);
        return fallback || Response.error();
      })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // ignore
  }

  // Prevent local dev backend from triggering production push notifications and vice-versa
  if (data.origin) {
    const swOrigin = self.location.origin.replace(/\/$/, '');
    const payloadOrigin = data.origin.replace(/\/$/, '');
    if (swOrigin !== payloadOrigin) {
      console.log('[SW] Ignored push notification from different environment:', payloadOrigin);
      return;
    }
  }

  const title = data.title || 'Actiproc';
  const options = {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.tag || 'taskflow',
    data: { url: data.url || '/notifications' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Accept only Actiproc/internal destinations. A payload cannot use notification
 * clicks to open arbitrary external sites or bypass our authenticated routes.
 */
function notificationDestination(raw) {
  try {
    const requested = typeof raw === 'string' && raw.trim() ? raw.trim() : '/notifications';
    if (requested.startsWith('//') || requested.startsWith('\\\\')) return self.location.origin + '/notifications';
    const url = new URL(requested, self.location.origin);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('scheme');
    if (![self.location.hostname, 'actiproc.com', 'www.actiproc.com'].includes(url.hostname.toLowerCase()))
      throw new Error('external');
    return self.location.origin + url.pathname + url.search + url.hash;
  } catch {
    return self.location.origin + '/notifications';
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = notificationDestination(event.notification?.data?.url);

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const local = windows.filter((client) => {
      try { return new URL(client.url).origin === self.location.origin; }
      catch { return false; }
    });
    const alreadyOnTarget = local.find((client) => client.url === target);
    if (alreadyOnTarget) return alreadyOnTarget.focus();

    // Navigate an existing app window before focusing it. Focusing first caused
    // the homepage to appear while navigation was still pending or interrupted.
    const existing = local.find((client) => client.visibilityState === 'visible') || local[0];
    if (existing) {
      try {
        const navigated = await existing.navigate(target);
        if (navigated) return navigated.focus();
      } catch {
        // An old/uncontrolled tab may not support navigation. Open an exact link.
      }
    }
    return self.clients.openWindow(target);
  })());
});
