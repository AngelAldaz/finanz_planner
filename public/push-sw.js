// Handlers de Web Push, importados por el service worker generado (Workbox).
// Se ejecutan aunque la app esté cerrada: iOS despierta el SW al llegar el push.
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (_e) {
    payload = { body: event.data ? event.data.text() : '' }
  }
  const title = payload.title || 'Finanz'
  const options = {
    body: payload.body || '',
    icon: payload.icon || 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: payload.tag || 'finanz-gastos',
    data: { url: payload.url || '.' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '.'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
