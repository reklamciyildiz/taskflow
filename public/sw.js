/* eslint-disable no-restricted-globals */

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

