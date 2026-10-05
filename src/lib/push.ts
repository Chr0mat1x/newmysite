/**
 * Web Push subscription, on top of the plain `Notification` API in
 * `notifications.ts`.
 *
 * This is the path that reaches a *closed* app. It needs three things: a service
 * worker, a VAPID public key baked in at build time, and a backend that can send
 * to the subscription it hands back. When any of them is missing the feature
 * degrades to the in-app bell rather than throwing.
 *
 * The key is public by design (it only identifies the sender); the matching
 * private key lives only in the Supabase function's secrets.
 */

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim()

/** A subscription serialised for the `push_subscriptions` table. */
export interface PushPayload {
  endpoint: string
  p256dh: string
  auth: string
}

export function pushConfigured(): boolean {
  return !!VAPID_PUBLIC_KEY
}

export function pushSupported(): boolean {
  return (
    pushConfigured() &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

/** base64url -> Uint8Array, the shape `subscribe()` wants for the VAPID key. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalised)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Register the worker, relative to the app base so it works under `/orbit/`. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    const base = new URL(import.meta.env.BASE_URL || '/', location.origin)
    const swUrl = new URL('sw.js', base).toString()
    const scope = base.pathname
    return await navigator.serviceWorker.register(swUrl, { scope })
  } catch {
    return null
  }
}

function toPayload(sub: PushSubscription): PushPayload | null {
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) return null
  return { endpoint: json.endpoint, p256dh, auth }
}

/**
 * Ensure a live push subscription exists and return it serialised. Assumes
 * notification permission has already been granted by the caller.
 */
export async function subscribePush(): Promise<PushPayload | null> {
  if (!pushSupported()) return null
  const reg = await registerServiceWorker()
  if (!reg) return null
  try {
    await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }))
    return toPayload(sub)
  } catch {
    return null
  }
}

/** Drop the browser-side subscription. The row is removed by the caller. */
export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    await sub?.unsubscribe()
  } catch {
    /* nothing to drop */
  }
}
