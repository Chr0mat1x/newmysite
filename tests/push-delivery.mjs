// End-to-end proof that a Web Push actually lands on the device.
//
// Creates a real subscription in Chrome, sends a real push through the push
// service with our VAPID keys, and then asks the service worker what
// notifications it raised. If a notification shows up, the whole chain works:
// VAPID signing, the subscription keys, and the worker's `push` handler.
//
// Temporary harness — it reaches the push service, so it is not part of the
// default suites. Run against a VAPID-configured dev server:
//   URL=http://localhost:12000/ node tests/push-delivery.mjs

import { chromium } from 'playwright-core'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import webpush from 'web-push'

const CHROME = process.env.CHROME || '/usr/bin/chromium'
const URL = process.env.URL || 'http://localhost:12000/'

const secrets = { VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY }
try {
  for (const line of readFileSync('/tmp/vapid_secrets.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !secrets[m[1]]) secrets[m[1]] = m[2]
  }
} catch {
  // env-only runs are fine
}
if (!secrets.VAPID_PUBLIC_KEY || !secrets.VAPID_PRIVATE_KEY) {
  console.log('set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (or /tmp/vapid_secrets.env)')
  process.exit(1)
}
webpush.setVapidDetails('https://chr0mat1x.github.io/orbit/', secrets.VAPID_PUBLIC_KEY, secrets.VAPID_PRIVATE_KEY)

const profile = mkdtempSync(join(tmpdir(), 'orbit-deliver-'))
const browser = await chromium.launchPersistentContext(profile, {
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
await browser.grantPermissions(['notifications'], { origin: new globalThis.URL(URL).origin })
const page = browser.pages()[0] ?? (await browser.newPage())
await page.addInitScript(() => localStorage.setItem('orbit.onboarded', '1'))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

const payload = await page.evaluate(async () => {
  const mod = await import('/src/lib/push.ts')
  await mod.registerServiceWorker()
  return mod.subscribePush()
})
if (!payload) {
  console.log('could not create a subscription')
  process.exit(1)
}

const status = await webpush.sendNotification(
  { endpoint: payload.endpoint, keys: { p256dh: payload.p256dh, auth: payload.auth } },
  JSON.stringify({ title: '@nova', body: 'sent you a transmission', url: URL, tag: 'orbit-dm-test' }),
)
console.log('push service accepted:', status.statusCode)

// Give the worker a moment to receive and raise the notification.
await page.waitForTimeout(4000)
const shown = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready
  const notes = await reg.getNotifications()
  return notes.map((n) => ({ title: n.title, body: n.body, tag: n.tag }))
})

console.log('\n=== ORBIT · push delivery ===')
console.log(shown.length ? 'PASS  notification reached the service worker' : 'FAIL  no notification arrived')
for (const n of shown) console.log(`      "${n.title}" — ${n.body} [${n.tag}]`)

await browser.close()
process.exit(shown.length ? 0 : 1)
