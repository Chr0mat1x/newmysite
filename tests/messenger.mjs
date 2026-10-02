// ORBIT messenger suite: two real planets exchanging private transmissions.
//
// Run: URL=https://<work-host>/ node tests/messenger.mjs
// Needs the local Supabase stack up and the `/sb` proxy (see AGENTS.md).
//
// It talks to Supabase directly for assertions, and checks the privacy rule that
// matters most here: the public anon key must not be able to read anyone's mail.

import { open, reporter, stamp, dismissOnboarding, signUpAndConfirm, openPalette } from './harness.mjs'

const SUPABASE = process.env.SUPABASE_URL || 'http://localhost:12000/sb'
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

const { ok, errors, finish } = reporter('ORBIT · messenger')

// two independent planets, each in its own browser context so their sessions
// cannot bleed into one another
const a = await open()
const b = await open()

const keyA = `msa${stamp()}`
const keyB = `msb${stamp()}`
const MAIL_A = `${keyA}@orbit.space`
const MAIL_B = `${keyB}@orbit.space`
const PW = 'orbit pass 9'
const NAME_A = `Sender ${keyA}`
const NAME_B = `Receiver ${keyB}`

const rest = async (path) => {
  const res = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  return res.json()
}

/**
 * Pull the live Supabase access token out of the page's localStorage, so
 * assertions can read the mail *as the signed-in participant*. The anon key
 * deliberately cannot see messages, so a plain `rest()` call would report zero
 * rows whether the write succeeded or not.
 */
const tokenOf = (page) =>
  page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (!k.includes('auth-token')) continue
      try {
        const v = JSON.parse(localStorage.getItem(k) ?? '')
        const t = v?.access_token ?? v?.currentSession?.access_token
        if (t) return t
      } catch {
        /* not the session blob */
      }
    }
    return null
  })

const restAs = async (token, path) => {
  const res = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  return res.json()
}

const planetId = async (name) => {
  const rows = await rest(`planets?select=id&name=eq.${encodeURIComponent(name)}`)
  return Array.isArray(rows) ? rows[0]?.id : undefined
}

try {
  // --- both planets exist ----------------------------------------------------
  await signUpAndConfirm(a.page, a.wait, { email: MAIL_A, password: PW, name: NAME_A, handle: keyA })
  await dismissOnboarding(a.page, a.wait)
  await signUpAndConfirm(b.page, b.wait, { email: MAIL_B, password: PW, name: NAME_B, handle: keyB })
  await dismissOnboarding(b.page, b.wait)

  const idA = await planetId(NAME_A)
  const idB = await planetId(NAME_B)
  ok('both planets exist in Supabase', !!idA && !!idB)

  // A's page loaded before B existed, and the galaxy only re-reads every 60s —
  // reload so the sender can actually find the recipient in the palette.
  await a.page.reload({ waitUntil: 'networkidle' })
  await a.wait(3500)
  await dismissOnboarding(a.page, a.wait)

  // --- messenger starts empty -----------------------------------------------
  await a.page.locator('button:has-text("messenger")').first().click()
  await a.wait(900)
  ok(
    'messenger opens with no threads',
    await a.page.locator('text=No transmissions yet.').first().isVisible().catch(() => false),
  )
  await a.page.keyboard.press('Escape')
  await a.page.locator('[aria-label="close messenger"]').first().click().catch(() => {})
  await a.wait(700)

  // --- demo planets cannot be messaged --------------------------------------
  await openPalette(a.page, a.wait, 'nova', true)
  const demoMessage = await a.page
    .locator('button:has-text("SEND A PRIVATE TRANSMISSION")')
    .first()
    .isVisible()
    .catch(() => false)
  ok('demo planet offers no message control', !demoMessage)
  await a.page.locator('[aria-label="close orbit"]').first().click().catch(() => {})
  await a.wait(700)

  // --- A sends B a message from B's orbit -----------------------------------
  await openPalette(a.page, a.wait, NAME_B, true)
  const msgButton = a.page.locator('button:has-text("SEND A PRIVATE TRANSMISSION")').first()
  ok('real planet offers a message control', await msgButton.isVisible().catch(() => false))
  await msgButton.click()
  await a.wait(900)

  const draft = a.page.locator('textarea[aria-label="message text"]').first()
  ok('thread composer opens', await draft.isVisible().catch(() => false))
  const body = `private probe ${stamp()}`
  await draft.fill(body)
  await a.page.locator('button[aria-label="send message"]').first().click()
  await a.wait(3000)
  ok('sent message appears in the thread', await a.page.locator(`text=${body}`).first().isVisible().catch(() => false))

  const tokenA = await tokenOf(a.page)
  const rows = await restAs(tokenA, `messages?select=id,sender,recipient,body&body=eq.${encodeURIComponent(body)}`)
  ok('message persisted to Supabase', Array.isArray(rows) && rows.length === 1, `rows=${rows?.length}`)
  ok('message is addressed sender -> recipient', rows?.[0]?.sender === idA && rows?.[0]?.recipient === idB)

  // --- privacy: the public anon key cannot read the mail --------------------
  const anonRead = await rest('messages?select=id')
  // a denial and an empty list are both acceptable; a leaked row is not
  ok('anon key cannot read private messages', !Array.isArray(anonRead) || anonRead.length === 0, `rows=${anonRead?.length}`)

  // --- B sees it as unread, then reads it -----------------------------------
  // B is already signed in from signup; a reload picks up the new message.
  await b.page.reload({ waitUntil: 'networkidle' })
  await b.wait(3500)
  await dismissOnboarding(b.page, b.wait)
  const badge = b.page.locator('button:has-text("messenger")').first()
  ok('recipient is in orbit', await badge.isVisible().catch(() => false))
  await badge.click()
  await b.wait(1200)

  ok(
    'recipient sees the thread in their list',
    await b.page.locator(`text=${body}`).first().isVisible().catch(() => false),
  )
  const unreadBefore = await b.page.locator('span:has-text("1")').first().isVisible().catch(() => false)
  ok('recipient has an unread badge', unreadBefore)

  await b.page.locator(`button:has-text("${NAME_A}")`).first().click().catch(async () => {
    // fall back to clicking the row containing the preview text
    await b.page.locator(`text=${body}`).first().click()
  })
  await b.wait(2500)
  ok(
    'thread opens with the message',
    await b.page.locator(`text=${body}`).first().isVisible().catch(() => false),
  )

  // the read receipt is written by the recipient's client
  const tokenB = await tokenOf(b.page)
  let readAt = null
  for (let i = 0; i < 8 && !readAt; i++) {
    const r = await restAs(tokenB, `messages?select=read_at&body=eq.${encodeURIComponent(body)}`)
    readAt = r?.[0]?.read_at ?? null
    if (!readAt) await b.wait(1000)
  }
  ok('opening the thread marks it read', !!readAt)

  // --- B replies, A receives it ---------------------------------------------
  const reply = `reply probe ${stamp()}`
  const replyDraft = b.page.locator('textarea[aria-label="message text"]').first()
  await replyDraft.fill(reply)
  await b.page.locator('button[aria-label="send message"]').first().click()
  await b.wait(3000)
  const replies = await restAs(tokenB, `messages?select=id,sender,recipient&body=eq.${encodeURIComponent(reply)}`)
  ok('reply persisted with reversed direction', replies?.[0]?.sender === idB && replies?.[0]?.recipient === idA)

  await a.page.reload({ waitUntil: 'networkidle' })
  await a.wait(3500)
  await dismissOnboarding(a.page, a.wait)
  await a.page.locator('button:has-text("messenger")').first().click()
  await a.wait(1200)
  await a.page.locator(`button:has-text("${NAME_B}")`).first().click()
  await a.wait(2000)
  ok('sender sees the reply after a reload', await a.page.locator(`text=${reply}`).first().isVisible().catch(() => false))

  ok('no unexpected console errors', a.contextErrors.length === 0 && b.contextErrors.length === 0, [
    ...a.contextErrors,
    ...b.contextErrors,
  ].join(' | '))
} finally {
  await a.browser.close()
  await b.browser.close()
}

process.exit(finish())
