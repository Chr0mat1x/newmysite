// ORBIT web-push suite: the parts that only exist in a real browser.
//
// Web Push is unavailable in an Android WebView, so the APK cannot use this —
// it is the installed-PWA path. This suite proves the browser side actually
// works: the worker registers, a subscription is created against the VAPID key,
// and it carries the endpoint + keys the server needs to send.
//
// Run: VITE_VAPID_PUBLIC_KEY=<key> npx vite --host --port 12000
//      URL=http://localhost:12000/ node tests/push.mjs

import { chromium } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME || '/usr/bin/chromium'
const URL = process.env.URL || 'http://localhost:12000/'

const results = []
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)

// A persistent profile, not an incognito context: Chrome refuses the Push API
// in incognito (crbug.com/41124656) with no way to feature-detect it, so the
// default Playwright context can never exercise this path.
const profile = mkdtempSync(join(tmpdir(), 'orbit-push-'))
const browser = await chromium.launchPersistentContext(profile, {
  executablePath: CHROME,
  headless: true,
  viewport: { width: 1200, height: 800 },
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
await browser.grantPermissions(['notifications'], { origin: new globalThis.URL(URL).origin })
const page = browser.pages()[0] ?? (await browser.newPage())
await page.addInitScript(() => localStorage.setItem('orbit.onboarded', '1'))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// The library is loaded as a module so the assertions run against real code,
// not a reimplementation.
const probe = await page.evaluate(async () => {
  const mod = await import('/src/lib/push.ts')
  return { supported: mod.pushSupported(), configured: mod.pushConfigured() }
})
ok('push is configured for this build', probe.configured)
ok('browser reports push support', probe.supported)

const reg = await page.evaluate(async () => {
  const mod = await import('/src/lib/push.ts')
  const r = await mod.registerServiceWorker()
  return r ? { scope: r.scope, active: !!r.active || !!r.installing || !!r.waiting } : null
})
ok('service worker registers', !!reg, reg?.scope ?? '')
ok('worker lands in the app scope', (reg?.scope ?? '').startsWith(new globalThis.URL(URL).origin))

const payload = await page.evaluate(async () => {
  const mod = await import('/src/lib/push.ts')
  return mod.subscribePush()
})
ok('a push subscription is created', !!payload)
ok('subscription carries a real endpoint', typeof payload?.endpoint === 'string' && payload.endpoint.startsWith('https://'))
ok('subscription carries the p256dh key', typeof payload?.p256dh === 'string' && payload.p256dh.length > 20)
ok('subscription carries the auth secret', typeof payload?.auth === 'string' && payload.auth.length > 10)

// Unsubscribing must actually release it, otherwise the row would linger.
await page.evaluate(async () => {
  const mod = await import('/src/lib/push.ts')
  await mod.unsubscribePush()
})
const after = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return !!sub
})
ok('unsubscribe releases the subscription', !after)

console.log('\n=== ORBIT · push ===')
for (const r of results) console.log(r)
const failures = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\nfailures: ${failures}`)

await browser.close()
process.exit(failures ? 1 : 0)
