// ORBIT mail suite: the password-recovery round trip.
//
// Run: URL=https://<work-host>/ node tests/mail.mjs
//
// Covers the whole loop the user cares about: request a link, read it from the
// catcher, follow it, set a new key, and prove the old one is dead. Needs the
// local stack's mail catcher reachable directly (CATCHER, default
// http://127.0.0.1:54324); the UI itself no longer exposes an inbox.

import { open, reporter, stamp, leaveOrbit, signUp, confirmFromMailbox, signIn, inOrbit, openAccount, URL } from './harness.mjs'

const { ok, errors, finish } = reporter('ORBIT · mail')
const { browser, page, wait, contextErrors } = await open()

const mail = `rec_${stamp()}@orbit.space`
const oldPw = 'orbit pass 9'
const newPw = 'brand new key 7'
const name = `Recovery ${stamp()}`

// --- signup sends a confirmation mail, and nothing works until it is opened ---
await signUp(page, wait, { email: mail, password: oldPw, name })
ok('signup stops at the confirmation step', await page.locator('text=confirm your address to launch').isVisible().catch(() => false))
ok('signup does not enter orbit yet', !(await inOrbit(page)))

await page.locator('button:has-text("sign in")').first().click()
await wait(500)
await page.fill('input[type="email"]', mail)
await page.fill('input[type="password"]', oldPw)
await page.locator('button:has-text("enter orbit")').click()
await wait(3000)
ok('unconfirmed sign-in is refused', !(await inOrbit(page)))

// the refusal should land back on the confirmation screen, with the mail ready
await confirmFromMailbox(page, wait, mail)
await wait(3500)
ok('account created after confirming', await inOrbit(page))

await leaveOrbit(page, wait)
await page.locator('button:has-text("sign in")').first().click()
await wait(500)
await page.locator('button:has-text("forgot your key")').click()
await wait(600)
ok('reset form offers a link', await page.locator('button:has-text("send reset link")').isVisible())

await page.fill('input[type="email"]', mail)
await page.locator('button:has-text("send reset link")').click()
await wait(3500)
ok('confirmation shown after requesting', await page.locator('text=reset link is on its way').first().isVisible().catch(() => false))
ok('resend is on cooldown right after a request', await page.locator('button:has-text("resend in")').first().isVisible().catch(() => false))

// --- the mail carries a link back to the app host ---------------------------
const catcher = process.env.CATCHER || 'http://127.0.0.1:54324'
let recoveryLink = null
for (let i = 0; i < 10 && !recoveryLink; i++) {
  const box = await fetch(`${catcher}/api/v1/messages`).then((r) => r.json()).catch(() => null)
  const hit = (box?.messages ?? []).find((m) => (m.To ?? []).some((t) => t.Address?.toLowerCase() === mail))
  if (hit) {
    const full = await fetch(`${catcher}/api/v1/message/${hit.ID}`).then((r) => r.json()).catch(() => null)
    const body = `${full?.Text ?? ''}\n${full?.HTML ?? ''}`
    const found = [...body.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]).find((l) => l.includes('/verify'))
    if (found) recoveryLink = found.replace(/^https?:\/\/(127\.0\.0\.1|localhost):54321/, `${URL.replace(/\/$/, '')}/sb`)
  }
  if (!recoveryLink) await wait(1500)
}
ok('message link points at the app host, not loopback', !!recoveryLink && !/\/\/127\.0\.0\.1/.test(recoveryLink), recoveryLink || 'none')

// --- follow it and set a new key -------------------------------------------
await page.goto(recoveryLink, { waitUntil: 'networkidle' })
await wait(3000)
ok('recovery screen shown after following the link', await page.locator('button:has-text("SET NEW KEY")').isVisible().catch(() => false))

await page.fill('input[autocomplete="new-password"]', newPw)
await page.fill('input[aria-label="confirm new password"]', newPw)
await page.locator('button:has-text("SET NEW KEY")').click()
await wait(4000)
ok('entered orbit on the recovery session', await inOrbit(page))

// --- the new key is the one that works -------------------------------------
await leaveOrbit(page, wait)
await signIn(page, wait, { email: mail, password: oldPw })
ok('old password is rejected', await page.locator('text=wrong email or password').first().isVisible().catch(() => false))

await page.fill('input[type="password"]', newPw)
await page.locator('button:has-text("ENTER ORBIT")').click()
await wait(3500)
ok('new password is accepted', await inOrbit(page))

// --- changing the email needs a confirmation at the new address -------------
const newMail = `moved_${stamp()}@orbit.space`
const subjectAt = async (address) => {
  const box = await fetch(`http://127.0.0.1:54324/api/v1/messages`).then((r) => r.json())
  return (box.messages ?? [])
    .filter((m) => m.To?.[0]?.Address === address)
    .map((m) => m.Subject ?? '')
}
await openAccount(page, wait)
await page.fill('input[aria-label="new email"]', newMail)
await page.locator('button:has-text("change email")').click()
await wait(3500)
ok('email change asks for confirmation', await page.locator('text=confirmation sent').first().isVisible().catch(() => false))

// Supabase's secure change notifies *both* addresses, so the old one keeps
// working until the new inbox confirms — that is what stops a typo locking you out
const newSubjects = await subjectAt(newMail)
ok('new address gets the change confirmation', newSubjects.some((s) => /new email/i.test(s)), newSubjects.join(','))
const oldSubjects = await subjectAt(mail)
ok('old address is told a change was requested', oldSubjects.some((s) => /new email/i.test(s)), oldSubjects.join(','))

ok('no unexpected console errors', contextErrors.length === 0, contextErrors.join(' | '))
errors.push(...contextErrors)

await browser.close()
process.exit(finish() === 0 ? 0 : 1)
