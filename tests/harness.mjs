// Shared harness for the ORBIT browser suites.
//
// These run against a *live* server, so set URL to whatever the app is served
// from. The defaults match the local work-host setup:
//   URL=https://work-1-fffmzaxhmllpadif.prod-runtime.all-hands.dev/
//
// The Supabase suites need the local stack up and the `/sb` proxy pointing at
// it (see AGENTS.md); the mail suite additionally needs `/mb`.

import { chromium, devices } from 'playwright-core'
import { readFileSync } from 'node:fs'

/**
 * Minimal .env.local reader so the suites can run without the caller exporting
 * anything. Values already in the environment win.
 */
function loadEnvLocal() {
  try {
    // `globalThis.URL` is deliberate: a bare `URL` would resolve to this
    // module's exported `URL` const, which is still in its temporal dead zone
    // here and would throw a ReferenceError that the catch below hides.
    const text = readFileSync(new globalThis.URL('../.env.local', import.meta.url), 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // no .env.local — the offline build is a valid configuration
  }
}
loadEnvLocal()

export const URL = process.env.URL || 'http://localhost:12000/'
export const CHROME = process.env.CHROME || '/usr/bin/chromium'

export function reporter(title) {
  const results = []
  const errors = []
  const ok = (name, condition, extra = '') => {
    results.push(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  }
  const finish = () => {
    console.log(`\n=== ${title} ===`)
    for (const r of results) console.log(r)
    if (errors.length) {
      console.log('\nerrors:')
      for (const e of errors) console.log('  ' + e)
    }
    const failures = results.filter((r) => r.startsWith('FAIL')).length
    console.log(`\nfailures: ${failures}`)
    return failures
  }
  return { ok, errors, finish }
}

export async function open({ mobile = false } = {}) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const context = await browser.newContext(
    mobile
      ? { ...devices['iPhone 13'], isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  )
  const page = await context.newPage()
  // The first-visit onboarding overlay appears as soon as the galaxy mounts and
  // swallows pointer events. Tests are not about onboarding, so mark it seen
  // before any app script runs; dismissOnboarding below stays as a fallback.
  await page.addInitScript(() => localStorage.setItem('orbit.onboarded', '1'))
  const contextErrors = []
  page.on('pageerror', (e) => contextErrors.push(`[pageerror] ${e.message}`))
  page.on('console', (m) => {
    // 400/422 are expected: the suite intentionally probes duplicate signups
    // and wrong passwords. Only surface console errors that are not those.
    if (m.type() === 'error' && !/status of (400|422)/.test(m.text())) {
      contextErrors.push(`[console] ${m.text()}`)
    }
  })
  page.on('dialog', (d) => d.accept().catch(() => {}))
  const wait = (ms) => page.waitForTimeout(ms)
  await page.goto(URL, { waitUntil: 'networkidle' })
  await wait(2500)
  // the first-visit onboarding overlay swallows pointer events until dismissed
  await dismissOnboarding(page, wait)
  return { browser, page, wait, contextErrors }
}

export const stamp = () => Date.now().toString(36).slice(-5)

export async function leaveOrbit(page, wait) {
  // An open orbit panel covers the footer with a scrim, so close it first.
  const close = page.locator('[aria-label="close orbit"]:visible').first()
  if (await close.isVisible().catch(() => false)) {
    await close.click()
    await wait(800)
  }
  // `leave orbit` exists twice (desktop footer and mobile menu); only one is
  // visible, and clicking the hidden one would silently do nothing.
  await page.locator('button:has-text("leave orbit"):visible').first().click()
  await wait(2000)
}

/**
 * A fresh account gets the onboarding overlay, which swallows pointer events
 * until dismissed. Anything that clicks into the galaxy must clear it first.
 */
export async function dismissOnboarding(page, wait) {
  const skip = page.locator('button:has-text("skip"):visible').first()
  if (await skip.isVisible().catch(() => false)) {
    await skip.click().catch(() => {})
    await wait(600)
  }
}

export async function openPalette(page, wait, query, fly = false) {
  await page.keyboard.press('Control+k')
  await wait(700)
  await page.fill('input[aria-label="command palette"]', query)
  await wait(700)
  if (fly) {
    await page.keyboard.press('ArrowDown')
    await wait(150)
    await page.keyboard.press('Enter')
    await wait(2600)
  }
}

export async function signUp(page, wait, { email, password, name }) {
  await page.fill('input[autocomplete="nickname"]', name)
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.locator('button:has-text("launch into orbit")').click()
  await wait(3500)
}

export async function signIn(page, wait, { email, password }) {
  await page.locator('button:has-text("sign in")').first().click()
  await wait(500)
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.locator('button:has-text("enter orbit")').click()
  await wait(3500)
}

export const inOrbit = (page) => page.locator('button:has-text("leave orbit"):visible').first().isVisible().catch(() => false)
