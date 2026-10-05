// send-push — deliver a Web Push for a just-inserted message.
//
// Why this exists at all: a closed app cannot hear Supabase realtime, so the
// sender's client calls this function right after it inserts a message. The
// function runs with the service role (to read subscriptions across planets),
// but only after it has re-read the message *as the caller* — RLS guarantees
// that row is one they can actually see, and the sender check guarantees they
// are the one who wrote it. So a client cannot push on someone else's behalf.
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUBLIC_APP_URL
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected.)

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'missing authorization' }, 401)

  let messageId: string | undefined
  try {
    messageId = (await req.json())?.messageId
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  if (!messageId) return json({ error: 'messageId is required' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const appUrl = Deno.env.get('PUBLIC_APP_URL') ?? 'https://chr0mat1x.github.io/orbit/'
  if (!vapidPublic || !vapidPrivate) return json({ error: 'push not configured' }, 500)

  // 1. Read the message *as the caller*. RLS shows it only if they are a
  //    participant, which is the privacy check we actually care about.
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } })
  const { data: userData } = await asUser.auth.getUser()
  const caller = userData?.user?.id
  if (!caller) return json({ error: 'not signed in' }, 401)

  const { data: msg, error: readError } = await asUser
    .from('messages')
    .select('id, sender, recipient, cluster, body, image')
    .eq('id', messageId)
    .maybeSingle()
  if (readError) return json({ error: readError.message }, 400)
  if (!msg) return json({ skipped: 'not visible' })
  if (msg.sender !== caller) return json({ error: 'not your message' }, 403)

  // 2. Work out who should be notified.
  const admin = createClient(url, service)
  let targets: string[] = []
  if (msg.recipient) {
    targets = [msg.recipient]
  } else if (msg.cluster) {
    const { data: members } = await admin
      .from('cluster_members')
      .select('planet')
      .eq('cluster', msg.cluster)
    targets = (members ?? []).map((m: { planet: string }) => m.planet).filter((p) => p !== caller)
  }
  if (!targets.length) return json({ skipped: 'no recipients' })

  const [{ data: sender }, { data: subs }] = await Promise.all([
    admin.from('planets').select('handle').eq('id', caller).maybeSingle(),
    admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('planet', targets),
  ])
  if (!subs?.length) return json({ skipped: 'no subscriptions' })

  webpush.setVapidDetails(appUrl, vapidPublic, vapidPrivate)

  const handle = sender?.handle ? `@${sender.handle}` : 'a planet'
  const body = msg.image && !msg.body ? 'sent you a photo' : (msg.body as string)
  const payload = JSON.stringify({
    title: handle,
    body,
    url: appUrl,
    tag: msg.cluster ? `orbit-cluster-${msg.cluster}` : `orbit-dm-${caller}`,
  })

  // 3. Fan out. A subscription the push service has forgotten (404/410) is dead
  //    weight, so drop its row rather than retrying it forever.
  let sent = 0
  const dead: string[] = []
  await Promise.all(
    subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 3600 },
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(s.id)
      }
    }),
  )
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead)

  return json({ sent, pruned: dead.length })
})
