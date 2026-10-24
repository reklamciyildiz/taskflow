/* eslint-disable no-restricted-globals */

const AXIOM_SHELL_CACHE = 'axiom-shell-v1';
const AXIOM_OFFLINE_URL = '/offline.html';
const AXIOM_PUBLIC_SHELL = [
  AXIOM_OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(AXIOM_SHELL_CACHE).then(async (cache) => {
      // The offline document is the only required entry. Optional branding assets
      // must never prevent a service-worker update from installing.
      await cache.add(new Request(AXIOM_OFFLINE_URL, { cache: 'reload' }));
      await Promise.allSettled(
        AXIOM_PUBLIC_SHELL.slice(1).map((url) =>
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
            .filter((key) => key.startsWith('axiom-shell-') && key !== AXIOM_SHELL_CACHE)
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

  const title = data.title || 'TaskFlow';
  const options = {
    body: data.body || '',
    tag: data.tag || 'taskflow',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url && c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        return existing.navigate(url);
      }
      return self.clients.openWindow(url);
    })
  );
});

