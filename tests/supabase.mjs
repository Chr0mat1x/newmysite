// ORBIT live-backend suite: exercises the real multi-user path through
// Supabase — signup, posting, starring, signals, follow, logout/re-login,
// visitor entry, and mobile.
//
// Run: URL=https://<work-host>/ node tests/supabase.mjs
// Needs the local Supabase stack up and the `/sb` proxy (see AGENTS.md).
//
// It talks to Supabase directly for assertions so it verifies rows actually
// landed, not just that the UI looked happy.

import { open, reporter, stamp, leaveOrbit, dismissOnboarding, openPalette, signUp, signUpAndConfirm, signIn, inOrbit, openAccount } from './harness.mjs'

const SUPABASE = process.env.SUPABASE_URL || 'http://localhost:12000/sb'
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

const { ok, errors, finish } = reporter('ORBIT · supabase')
const { browser, page, wait, contextErrors } = await open()

const key = `e2e${stamp()}`
const MAIL = `${key}@orbit.space`
const PW = 'orbit pass 9'
const NAME = `E2E ${key}`

const rest = async (path) => {
  const res = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  return res.json()
}

// --- planet row is created on signup ---------------------------------------
const before = await rest('planets?select=id&handle=eq.nova')
ok('seeded demo planets are readable', Array.isArray(before) && before.length === 1)

await signUpAndConfirm(page, wait, { email: MAIL, password: PW, name: NAME, handle: key })
await dismissOnboarding(page, wait)
ok('signup lands in the galaxy after confirming', await inOrbit(page))
ok('new planet has no satellites yet', (await page.locator('text=0 satellites').first().isVisible().catch(() => false)))

const mine = await rest(`planets?select=id&name=eq.${encodeURIComponent(NAME)}`)
ok('planet persisted to Supabase', Array.isArray(mine) && mine.length === 1)

// --- posting ---------------------------------------------------------------
await openPalette(page, wait, 'launch a new satellite')
await page.keyboard.press('Enter')
await wait(1200)
ok('composer opens', await page.locator('text=Launch a satellite').first().isVisible().catch(() => false))
const body = `probe ${stamp()}`
await page.fill('textarea', body)
await page.locator('button:has-text("LAUNCH")').first().click()
await wait(3500)

const sat = await rest(`satellites?select=id&body=eq.${encodeURIComponent(body)}`)
ok('satellite persisted to Supabase', Array.isArray(sat) && sat.length === 1, `rows=${sat.length}`)

// --- starring --------------------------------------------------------------
await openPalette(page, wait, 'fly to my orbit')
await page.keyboard.press('Enter')
await wait(2800)
const star = page.locator('button[aria-label="star this post"]').first()
ok('own satellite is starrable', await star.isVisible().catch(() => false))
if (await star.isVisible().catch(() => false)) {
  await star.click()
  await wait(2500)
}
const starred = await rest(`stars?select=satellite&satellite=eq.${sat?.[0]?.id}`)
ok('starring persisted to Supabase', Array.isArray(starred) && starred.length >= 1)

// --- signals ---------------------------------------------------------------
const sig = page.locator('button[aria-label="toggle signals"]').first()
await sig.click()
await wait(900)
const draft = page.locator('input[placeholder="send a signal into their orbit…"]').first()
ok('signals console opens on a satellite', await draft.isVisible().catch(() => false))
if (await draft.isVisible().catch(() => false)) {
  await draft.fill('hello from the probe')
  await draft.press('Enter')
  await wait(2500)
}
const signals = await rest(`signals?select=id&satellite=eq.${sat?.[0]?.id}`)
ok('signal persisted to Supabase', Array.isArray(signals) && signals.length >= 1)

// --- follow ----------------------------------------------------------------
// Following is an array on the planet row, not a join table.
await openPalette(page, wait, 'nova', true)
const follow = page.locator('button:has-text("FOLLOW")').first()
ok('demo planet exposes a follow control', await follow.isVisible().catch(() => false))
if (await follow.isVisible().catch(() => false)) {
  await follow.click()
  await wait(2500)
}
const demo = await rest('planets?select=id&handle=eq.nova')
const me = await rest(`planets?select=following&id=eq.${mine?.[0]?.id}`)
ok('follow persisted to Supabase', (me?.[0]?.following ?? []).includes(demo?.[0]?.id))

// --- session persistence ---------------------------------------------------
await leaveOrbit(page, wait)
ok('logout returns to the auth gate', await page.locator('button:has-text("sign in")').first().isVisible().catch(() => false))

await signIn(page, wait, { email: MAIL, password: PW })
ok('signing back in restores the same planet', await inOrbit(page))

// --- account settings: change the key from a live session -------------------
await openAccount(page, wait)
ok('account settings opens', await page.locator('[aria-label="account settings"]').isVisible().catch(() => false))

await page.locator('button:has-text("password")').first().click()
await wait(600)
const NEW_PW = 'fresh key 42!'
await page.fill('input[aria-label="current password"]', PW)
await page.fill('input[aria-label="new password"]', NEW_PW)
await page.fill('input[aria-label="confirm new password"]', NEW_PW)
await page.locator('button:has-text("change password")').click()
await wait(3000)
ok('password change is accepted', await page.locator('text=key changed').first().isVisible().catch(() => false))

// the new key is real: sign out and back in with it
await page.locator('[aria-label="close settings"]').click()
await wait(500)
await leaveOrbit(page, wait)
await signIn(page, wait, { email: MAIL, password: PW })
ok('old key is now dead', await page.locator('text=wrong email or password').first().isVisible().catch(() => false))
await page.fill('input[type="password"]', NEW_PW)
await page.locator('button:has-text("enter orbit")').click()
await wait(3500)
ok('new key signs in', await inOrbit(page))
await leaveOrbit(page, wait)

// --- auth errors -----------------------------------------------------------
await signIn(page, wait, { email: MAIL, password: 'definitely wrong' })
ok('wrong password is rejected', await page.locator('text=wrong email or password').first().isVisible().catch(() => false))

await page.locator('button:has-text("create planet")').first().click()
await wait(500)
await signUp(page, wait, { email: MAIL, password: PW, name: NAME })
ok('duplicate email is refused', await page.locator('text=already').first().isVisible().catch(() => false))

// --- visitor path ----------------------------------------------------------
await page.locator('button:has-text("or explore a demo planet")').click()
await wait(1200)
ok('explore list offers demo planets', (await page.locator('button:has-text("Nova")').count()) >= 1)

// anonymous sign-in must survive email confirmations being switched on
await page.locator('button:has-text("Nova")').first().click()
await wait(3500)
ok('visitor enters the galaxy without confirming anything', await inOrbit(page))

// --- deletion: sign back into the real planet and remove it -----------------
await page.locator('[aria-label="close orbit"]').first().click()
await wait(900)
await leaveOrbit(page, wait)
await signIn(page, wait, { email: MAIL, password: NEW_PW })
ok('registered planet is reachable for deletion', await inOrbit(page))

await openAccount(page, wait)
await page.locator('button:has-text("danger")').first().click()
await wait(600)
await page.fill('input[aria-label="confirm delete"]', `@${key}`)
await page.locator('button:has-text("delete my planet")').click()
await wait(4000)
ok('deleting the planet returns to the auth gate', !(await inOrbit(page)))
const gone = await rest(`planets?select=id&name=eq.${encodeURIComponent(NAME)}`)
ok('deleted planet is gone from Supabase', Array.isArray(gone) && gone.length === 0)

await browser.close()
ok('no unexpected console errors', contextErrors.length === 0, contextErrors.join(' | '))
errors.push(...contextErrors)
process.exit(finish() === 0 ? 0 : 1)
