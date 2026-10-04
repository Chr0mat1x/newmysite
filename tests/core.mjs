// ORBIT core suite: pure client logic that holds in either backend mode — the
// procedural identity layer, auth rules, and mobile layout.
//
// Run: node tests/core.mjs            (needs `npm run dev` up)

import { open, reporter } from './harness.mjs'

const { ok, errors, finish } = reporter('ORBIT · core')
const { browser, page, contextErrors } = await open()

ok('auth gate renders', await page.locator('button:has-text("create planet")').first().isVisible().catch(() => false))
ok('launch screen offers worlds to pick', (await page.locator('button[aria-label^="world"]').count()) >= 6)

// --- planet generation is deterministic and varied -------------------------
const planets = await page.evaluate(async () => {
  const mod = await import('/src/lib/procgen.ts')
  const a = mod.generatePlanet(mod.hashString('nova'))
  const b = mod.generatePlanet(mod.hashString('nova'))
  const c = mod.generatePlanet(mod.hashString('vela'))
  return {
    stable: JSON.stringify(a) === JSON.stringify(b),
    differs: JSON.stringify(a) !== JSON.stringify(c),
    texture: a.texture,
    size: mod.planetSprite(a, 32).width,
  }
})
ok('same seed yields the same planet', planets.stable)
ok('different seeds yield different planets', planets.differs, planets.texture)
ok('planet sprite covers the asked size', planets.size >= 32, `px=${planets.size}`)

// --- planets are derived from identity -------------------------------------
const planetsOf = await page.evaluate(async () => {
  const mod = await import('/src/lib/seed.ts')
  const one = mod.makeUser('nova', 'Nova')
  const two = mod.makeUser('nova', 'Nova')
  const seedFromName = mod.planetSeed('nova', 'Nova')
  return { handle: one.handle, sameSeed: one.seed === two.seed, seedFromName }
})
ok('a planet gets a handle', !!planetsOf.handle, `@${planetsOf.handle}`)
ok('procedural seed is stable per handle', planetsOf.sameSeed && planetsOf.seedFromName > 0)

// --- auth rules live in one place ------------------------------------------
const rules = await page.evaluate(async () => {
  const mod = await import('/src/lib/auth.ts')
  return {
    min: mod.PASSWORD_MIN,
    short: mod.isValidPassword('short'),
    long: mod.isValidPassword('long enough key'),
    badEmail: mod.isValidEmail('nope'),
    goodEmail: mod.isValidEmail('a@b.co'),
  }
})
ok('password minimum is enforced', rules.min >= 8 && !rules.short && rules.long, `min=${rules.min}`)
ok('email validation rejects junk', !rules.badEmail && rules.goodEmail)

// --- layout ----------------------------------------------------------------
ok('no horizontal overflow on desktop', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))

// --- image transmissions (real LocalBackend path) --------------------------
// Two real planets, then a message that carries only an image. This drives the
// same code the UI does, not a stub: signUp -> sendMessage -> state.messages.
const img = await page.evaluate(async () => {
  const { LocalBackend } = await import('/src/lib/backends/local.ts')
  const b = new LocalBackend()
  await b.signUp('img-a@orbit.space', 'orbit pass 9', 'Image Alpha', 1, 'img_alpha')
  const after = await b.signUp('img-b@orbit.space', 'orbit pass 9', 'Image Beta', 2, 'img_beta')
  const users = Object.values(after.state.users)
  const alpha = users.find((u) => u.handle === 'img_alpha')
  const beta = users.find((u) => u.handle === 'img_beta')
  const pic = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
  const sent = await b.sendMessage(alpha.id, '', pic)
  const stored = Object.values(sent.messages).find((m) => m.from === beta.id && m.to === alpha.id)
  let emptyErr = null
  try {
    await b.sendMessage(alpha.id, '', '')
  } catch (e) {
    emptyErr = e.message
  }
  return { image: stored?.image ?? null, text: stored?.text ?? null, emptyErr }
})
ok('an image-only transmission is stored', (img.image ?? '').startsWith('data:image/'), img.text === '' ? 'text=""' : '')
ok('an empty transmission is refused', !!img.emptyErr, img.emptyErr ?? 'no error raised')

// Backend availability is not this suite's concern: when Supabase is down the
// shared galaxy still renders through its error state, but requests 500. Only
// real application errors matter here.
const appErrors = contextErrors.filter((e) => !/Failed to load resource/.test(e))
ok('no unexpected console errors', appErrors.length === 0, appErrors.join(' | '))
errors.push(...appErrors)

await browser.close()
process.exit(finish() === 0 ? 0 : 1)
