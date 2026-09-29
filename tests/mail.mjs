// ORBIT mail suite: the password-recovery round trip.
//
// Run: URL=https://<work-host>/ node tests/mail.mjs
//
// Covers the whole loop the user cares about: request a link, read it in the
// in-app mailbox, follow it, set a new key, and prove the old one is dead.
// Needs the local stack's mail catcher reached through the `/mb` proxy.

import { open, reporter, stamp, leaveOrbit, signUp, signIn, inOrbit } from './harness.mjs'

const { ok, errors, finish } = reporter('ORBIT · mail')
const { browser, page, wait, contextErrors } = await open()

const mail = `rec_${stamp()}@orbit.space`
const oldPw = 'orbit pass 9'
const newPw = 'brand new key 7'
const name = `Recovery ${stamp()}`

// --- a real account to recover ---------------------------------------------
await signUp(page, wait, { email: mail, password: oldPw, name })
ok('account created', await inOrbit(page))

await leaveOrbit(page, wait)
await page.locator('button:has-text("sign in")').first().click()
await wait(500)
await page.locator('button:has-text("forgot your key")').click()
await wait(600)
ok('reset form offers a link', await page.locator('button:has-text("send reset link")').isVisible())

await page.fill('input[type="email"]', mail)
await page.locator('button:has-text("send reset link")').click()
await wait(3500)
ok('confirmation shown after requesting', await page.locator('text=reset link sent').first().isVisible().catch(() => false))

// --- the mailbox surfaces the message --------------------------------------
ok('mailbox panel is available', await page.locator('button:has-text("mailbox")').first().isVisible().catch(() => false))
for (let i = 0; i < 8; i++) {
  if (await page.locator('button:has-text("mailbox") span.rounded-full').first().textContent().catch(() => null)) break
  await wait(1500)
}
const count = await page.locator('button:has-text("mailbox") span.rounded-full').first().textContent().catch(() => null)
ok('mailbox picked the message up', !!count, `count=${count}`)

await page.locator('div.border-t button').first().click()
await wait(1200)
const links = await page.locator('a:has-text("open link")').evaluateAll((as) => as.map((a) => a.href))
const link = links.find((l) => l.includes('/sb/auth/v1/verify')) || links[0]
ok('message link points at the app host, not loopback', !!link && !/\/\/127\.0\.0\.1/.test(link), link || 'none')

// --- follow it and set a new key -------------------------------------------
await page.goto(link, { waitUntil: 'networkidle' })
await wait(3000)
ok('recovery screen shown after following the link', await page.locator('button:has-text("set new key")').isVisible().catch(() => false))

await page.fill('input[autocomplete="new-password"]', newPw)
await page.locator('button:has-text("set new key")').click()
await wait(4000)
ok('entered orbit on the recovery session', await inOrbit(page))

// --- the new key is the one that works -------------------------------------
await leaveOrbit(page, wait)
await signIn(page, wait, { email: mail, password: oldPw })
ok('old password is rejected', await page.locator('text=wrong email or password').first().isVisible().catch(() => false))

await page.fill('input[type="password"]', newPw)
await page.locator('button:has-text("enter orbit")').click()
await wait(3500)
ok('new password is accepted', await inOrbit(page))

ok('no unexpected console errors', contextErrors.length === 0, contextErrors.join(' | '))
errors.push(...contextErrors)

await browser.close()
process.exit(finish() === 0 ? 0 : 1)
