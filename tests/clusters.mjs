// ORBIT clusters suite: finding planets by name, and group transmissions.
//
// Run: URL=https://<work-host>/ node tests/clusters.mjs
// Needs the local Supabase stack up and the `/sb` proxy (see AGENTS.md).
//
// Three planets are involved: A and B form a cluster, C must never see it. The
// suite checks the search directory, the group round trip, and that the privacy
// rules hold for both the outsider and the public anon key.

import { open, reporter, stamp, dismissOnboarding, signUpAndConfirm } from './harness.mjs'

const SUPABASE = process.env.SUPABASE_URL || 'http://localhost:12000/sb'
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

const { ok, errors, finish } = reporter('ORBIT · clusters')

const a = await open()
const b = await open()
const c = await open()

const keyA = `cla${stamp()}`
const keyB = `clb${stamp()}`
const keyC = `clc${stamp()}`
const MAIL_A = `${keyA}@orbit.space`
const MAIL_B = `${keyB}@orbit.space`
const MAIL_C = `${keyC}@orbit.space`
const PW = 'orbit pass 9'
const NAME_A = `Clusterer ${keyA}`
const NAME_B = `Invited ${keyB}`
const NAME_C = `Outsider ${keyC}`
const CLUSTER = `Outer Rim ${stamp()}`

const rest = async (path) => {
  const res = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  return res.json()
}

const rpc = async (fn, args, token) => {
  const res = await fetch(`${SUPABASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token ?? ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

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

/** Open the messenger and land on the thread list. */
async function openMessenger(page, wait) {
  await page.locator('button:has-text("messenger")').first().click()
  await wait(1200)
}

try {
  // --- three planets exist ---------------------------------------------------
  await signUpAndConfirm(a.page, a.wait, { email: MAIL_A, password: PW, name: NAME_A, handle: keyA })
  await dismissOnboarding(a.page, a.wait)
  await signUpAndConfirm(b.page, b.wait, { email: MAIL_B, password: PW, name: NAME_B, handle: keyB })
  await dismissOnboarding(b.page, b.wait)
  await signUpAndConfirm(c.page, c.wait, { email: MAIL_C, password: PW, name: NAME_C, handle: keyC })
  await dismissOnboarding(c.page, c.wait)

  const idA = await planetId(NAME_A)
  const idB = await planetId(NAME_B)
  const idC = await planetId(NAME_C)
  ok('all three planets exist', !!idA && !!idB && !!idC)

  // A loaded before B and C existed; reload so the directory sees them
  await a.page.reload({ waitUntil: 'networkidle' })
  await a.wait(3500)
  await dismissOnboarding(a.page, a.wait)

  // --- search the directory by handle and by name ---------------------------
  await openMessenger(a.page, a.wait)
  const find = a.page.locator('input[aria-label="find planets"]').first()
  ok('messenger offers a planet search', await find.isVisible().catch(() => false))

  await find.fill(keyB)
  await a.wait(2500)
  ok(
    'search by @handle finds the planet',
    await a.page.locator(`text=@${keyB}`).first().isVisible().catch(() => false),
  )

  await find.fill(NAME_B)
  await a.wait(2500)
  ok(
    'search by display name finds the planet',
    await a.page.locator(`text=${NAME_B}`).first().isVisible().catch(() => false),
  )

  await find.fill('nova')
  await a.wait(2500)
  ok(
    'demo planets show up marked as demo',
    await a.page.locator('text=demo planet').first().isVisible().catch(() => false),
  )

  // --- the directory is not open to the public anon key ---------------------
  const anonSearch = await rpc('planet_directory', { term: 'nova', max_rows: 5 })
  ok('anon key cannot search the directory', anonSearch.status >= 400, `status=${anonSearch.status}`)

  await find.fill('')

  // --- A forms a cluster with B ---------------------------------------------
  await a.page.locator('button[aria-label="clusters tab"]').first().click()
  await a.wait(700)
  ok(
    'clusters tab starts empty',
    await a.page.locator('text=No clusters yet.').first().isVisible().catch(() => false),
  )

  await a.page.locator('button:has-text("NEW CLUSTER")').first().click()
  await a.wait(900)
  await a.page.locator('input[aria-label="cluster name"]').first().fill(CLUSTER)
  await a.page.locator('input[aria-label="search members"]').first().fill(keyB)
  await a.wait(2500)
  await a.page.locator(`button:has-text("${NAME_B}")`).first().click()
  await a.wait(600)
  await a.page.locator('button:has-text("CREATE CLUSTER")').first().click()
  await a.wait(3500)

  ok(
    'the new cluster opens with its name',
    await a.page.locator(`text=${CLUSTER}`).first().isVisible().catch(() => false),
  )
  ok(
    'the creator is listed as a member',
    await a.page.locator('text=you').first().isVisible().catch(() => false),
  )

  // --- A sends a line into the cluster --------------------------------------
  const line = `cluster line ${stamp()}`
  await a.page.locator('textarea[aria-label="message text"]').first().fill(line)
  await a.page.locator('button[aria-label="send message"]').first().click()
  await a.wait(3000)
  ok('the cluster line appears in the thread', await a.page.locator(`text=${line}`).first().isVisible().catch(() => false))

  const tokenA = await tokenOf(a.page)
  const clusterRows = await restAs(tokenA, `clusters?select=id,name,creator&name=eq.${encodeURIComponent(CLUSTER)}`)
  const clusterId = Array.isArray(clusterRows) ? clusterRows[0]?.id : undefined
  ok('cluster persisted to Supabase', !!clusterId, `id=${clusterId}`)

  const members = await restAs(tokenA, `cluster_members?select=planet&cluster=eq.${clusterId}`)
  const memberIds = (members ?? []).map((m) => m.planet).sort()
  ok('both planets are members', memberIds.length === 2 && memberIds.includes(idA) && memberIds.includes(idB))

  const stored = await restAs(tokenA, `messages?select=id,sender,cluster,recipient&cluster=eq.${clusterId}`)
  ok('the line is stored as a cluster message', stored?.[0]?.cluster === clusterId && stored?.[0]?.recipient === null)

  // --- the outsider cannot see the cluster or its lines ---------------------
  const tokenC = await tokenOf(c.page)
  const cClusters = await restAs(tokenC, `clusters?select=id&name=eq.${encodeURIComponent(CLUSTER)}`)
  ok('a non-member sees no cluster row', Array.isArray(cClusters) && cClusters.length === 0, `rows=${cClusters?.length}`)
  const cLines = await restAs(tokenC, `messages?select=id&cluster=eq.${clusterId}`)
  ok('a non-member sees no cluster lines', Array.isArray(cLines) && cLines.length === 0, `rows=${cLines?.length}`)

  const anonClusters = await rest('clusters?select=id')
  // a denial (401 from the membership helper) and an empty list are both fine;
  // what must never happen is a leaked row
  ok('anon key cannot read clusters', !Array.isArray(anonClusters) || anonClusters.length === 0)

  // --- B receives it --------------------------------------------------------
  await b.page.reload({ waitUntil: 'networkidle' })
  await b.wait(3500)
  await dismissOnboarding(b.page, b.wait)
  await openMessenger(b.page, b.wait)
  await b.page.locator('button[aria-label="clusters tab"]').first().click()
  await b.wait(1000)
  ok(
    'the invited planet sees the cluster',
    await b.page.locator(`text=${CLUSTER}`).first().isVisible().catch(() => false),
  )

  await b.page.locator(`button:has-text("${CLUSTER}")`).first().click()
  await b.wait(2500)
  ok(
    'the invited planet reads the line',
    await b.page.locator(`text=${line}`).first().isVisible().catch(() => false),
  )

  const tokenB = await tokenOf(b.page)
  let readAt = null
  for (let i = 0; i < 8 && !readAt; i++) {
    const r = await restAs(tokenB, `messages?select=read_at&cluster=eq.${clusterId}`)
    readAt = r?.[0]?.read_at ?? null
    if (!readAt) await b.wait(1000)
  }
  ok('opening the cluster marks it read', !!readAt)

  // --- B replies, A receives it --------------------------------------------
  const reply = `cluster reply ${stamp()}`
  await b.page.locator('textarea[aria-label="message text"]').first().fill(reply)
  await b.page.locator('button[aria-label="send message"]').first().click()
  await b.wait(3000)
  const replies = await restAs(tokenB, `messages?select=id,sender,cluster&body=eq.${encodeURIComponent(reply)}`)
  ok('the reply is stored in the cluster', replies?.[0]?.cluster === clusterId && replies?.[0]?.sender === idB)

  await a.page.reload({ waitUntil: 'networkidle' })
  await a.wait(3500)
  await dismissOnboarding(a.page, a.wait)
  await openMessenger(a.page, a.wait)
  await a.page.locator('button[aria-label="clusters tab"]').first().click()
  await a.wait(1000)
  await a.page.locator(`button:has-text("${CLUSTER}")`).first().click()
  await a.wait(2500)
  ok(
    'the creator sees the reply after a reload',
    await a.page.locator(`text=${reply}`).first().isVisible().catch(() => false),
  )

  // --- a direct thread still works alongside clusters -----------------------
  await a.page.locator('[aria-label="back to threads"]').first().click()
  await a.wait(700)
  await a.page.locator('button[aria-label="direct tab"]').first().click()
  await a.wait(500)
  await a.page.locator('input[aria-label="find planets"]').first().fill(keyC)
  await a.wait(2500)
  await a.page.locator(`button:has-text("${NAME_C}")`).first().click()
  await a.wait(1200)
  const dm = `direct still works ${stamp()}`
  await a.page.locator('textarea[aria-label="message text"]').first().fill(dm)
  await a.page.locator('button[aria-label="send message"]').first().click()
  await a.wait(3000)
  const dmRows = await restAs(tokenA, `messages?select=id,cluster,recipient&body=eq.${encodeURIComponent(dm)}`)
  ok('direct messages are unaffected by clusters', dmRows?.[0]?.cluster === null && dmRows?.[0]?.recipient === idC)

  ok(
    'no unexpected console errors',
    a.contextErrors.length === 0 && b.contextErrors.length === 0 && c.contextErrors.length === 0,
    [...a.contextErrors, ...b.contextErrors, ...c.contextErrors].join(' | '),
  )
} finally {
  await a.browser.close()
  await b.browser.close()
  await c.browser.close()
}

process.exit(finish())
