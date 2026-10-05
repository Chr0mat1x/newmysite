/*
 * ORBIT service worker — the piece that lets a message wake a closed app.
 *
 * It is intentionally tiny: it owns no cache (a stale cache would fight the
 * 10-minute Pages cache the app already deals with) and does one thing — turn a
 * Web Push message into a notification, and a tap into a deep link back into
 * the app. Everything else stays in the page.
 */

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'ORBIT'
  const options = {
    body: data.body || '',
    icon: data.icon || 'brand/orbit-logo-128.png',
    badge: data.badge || 'brand/orbit-logo-64.png',
    tag: data.tag || 'orbit-activity',
    renotify: true,
    data: { url: data.url || './' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || './'

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Prefer focusing a tab that is already on the app rather than stacking
      // another one — same behaviour as tapping a chat notification in a chat app.
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target).catch(() => {})
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target)
    })(),
  )
})
