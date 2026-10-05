// Temporary verification for the notifications feature (offline backend).
import { open, reporter, dismissOnboarding } from './harness.mjs'

const { ok, errors, finish } = reporter('ORBIT · notifications')

const { browser, page, wait, contextErrors } = await open()
await dismissOnboarding(page, wait)

// offline mode signs you straight in; if not, make a planet
if (await page.locator('button:has-text("create planet")').first().isVisible().catch(() => false)) {
  const stamp = Date.now().toString(36).slice(-5)
  await page.fill('input[autocomplete="nickname"]', 'Notif Tester')
  await page.fill('input[aria-label="handle"]', `nt${stamp}`)
  await page.fill('input[type="email"]', `nt${stamp}@orbit.space`)
  await page.fill('input[type="password"]', 'orbit pass 9')
  await page.fill('input[aria-label="confirm password"]', 'orbit pass 9')
  await page.locator('input[aria-label="accept the rules"]').check()
  await page.locator('button:has-text("launch into orbit")').click()
  await wait(3500)
  await dismissOnboarding(page, wait)
}

ok('bell is present in the header', await page.locator('button[aria-label*="notification"]').first().isVisible().catch(() => false))

// Have a second planet send a private transmission to the signed-in user.
const seeded = await page.evaluate(async () => {
  const { LocalBackend } = await import('/src/lib/backends/local.ts')
  const raw = JSON.parse(localStorage.getItem('orbit.galaxy.v1'))
  const me = raw.currentUserId
  const b = new LocalBackend()
  const stamp = Math.random().toString(36).slice(2, 7)
  const after = await b.signUp(`sender-${stamp}@orbit.space`, 'orbit pass 9', `Sender ${stamp}`, 3, `snd${stamp}`)
  const sender = Object.values(after.state.users).find((u) => u.handle === `snd${stamp}`)
  await b.sendMessage(me, 'hello from the void')
  // restore the signed-in planet so the reload lands back in my orbit
  const s = JSON.parse(localStorage.getItem('orbit.galaxy.v1'))
  s.currentUserId = me
  localStorage.setItem('orbit.galaxy.v1', JSON.stringify(s))
  return { sender: sender.handle }
})

await page.reload({ waitUntil: 'networkidle' })
await wait(3000)
await dismissOnboarding(page, wait)

const bellLabel = () =>
  page.locator('button[aria-label*="notification"]').first().getAttribute('aria-label')

ok('bell shows an unread badge', /^\d+ notifications$/.test((await bellLabel()) || ''))

await page.locator('button[aria-label*="notification"]').first().click()
await wait(900)
ok('notifications panel opens', await page.locator('h3:has-text("Notifications")').isVisible().catch(() => false))
ok(
  'the new transmission is listed',
  await page.locator(`text=@${seeded.sender} sent you a transmission`).first().isVisible().catch(() => false),
)
ok('panel offers a system-notification toggle', await page.locator('button:has-text("System notifications")').isVisible().catch(() => false))

// Opening the bell marks everything seen -> badge clears
await page.locator('button[aria-label="close notifications"]').click()
await wait(700)
ok('badge clears once the feed is opened', (await bellLabel()) === 'notifications')

ok('no unexpected console errors', contextErrors.length === 0, contextErrors.join(' | ').slice(0, 200))

const failures = finish()
await browser.close()
process.exit(failures ? 1 : 0)
