import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase is optional: ORBIT ships as a fully offline demo, so the client is
 * null unless both VITE_SUPABASE_* variables are present at build time.
 * `isRemote` is the single switch the data layer reads.
 *
 * The URL may be relative (e.g. `/sb`). That is how the local stack is reached
 * from the work-host preview: the dev server proxies `/sb` to Supabase, so the
 * browser only ever talks to its own origin and needs no tunnel or CORS.
 */

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

/** absolutise a relative base path against the page origin */
function resolveUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw
  return new URL(raw, window.location.origin).toString()
}

export const supabase: SupabaseClient | null =
  rawUrl && anonKey
    ? createClient(resolveUrl(rawUrl), anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null

/**
 * Set when a password-recovery link is opened. supabase-js turns the tokens in
 * the URL into a session and emits PASSWORD_RECOVERY; the app then asks for a
 * new password instead of dropping the user into the galaxy.
 *
 * A recovery link signs the user in, so this flag is what keeps the "set a new
 * key" screen on top of the galaxy. It has to be observable: the auth event can
 * land before React subscribes, so the store reads `pending` on mount and
 * subscribes for later changes.
 */
export const recovery = {
  pending: false,
  listeners: new Set<() => void>(),
  set(pending: boolean) {
    this.pending = pending
    for (const listener of this.listeners) listener()
  },
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  },
}

supabase?.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') recovery.set(true)
})

/**
 * Set when a `#token_hash` mail link was present but the exchange failed —
 * typically an expired link, or one already spent by an earlier click. The auth
 * gate shows it so a dead link does not look like an ordinary signed-out visit.
 */
export const mailLink = {
  error: null as string | null,
  listeners: new Set<() => void>(),
  set(error: string | null) {
    this.error = error
    for (const listener of this.listeners) listener()
  },
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  },
}

/**
 * The verification types Supabase issues in mail links. Kept in sync with the
 * `type=` the templates append.
 */
type OtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'

/**
 * Finish a mail link that carries `#token_hash=…&type=…`.
 *
 * The default Supabase link points at `/auth/v1/verify`, which consumes the
 * one-time token the moment *anything* fetches it — and mail providers
 * (Yandex, Gmail) prefetch links to scan them, so the token is already spent by
 * the time the user clicks and they land on the app signed out. Linking to the
 * app itself with the hash avoids that: the fragment never leaves the browser,
 * so the scanner's fetch is just a static page, and this runs the exchange in
 * the user's own tab.
 *
 * The hash is stripped before the request so a reload cannot replay a spent
 * token.
 */
export async function consumeEmailLink(): Promise<void> {
  if (!supabase) return
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return
  const params = new URLSearchParams(raw)
  const token_hash = params.get('token_hash')
  const type = params.get('type') as OtpType | null
  if (!token_hash || !type) return
  history.replaceState(null, '', window.location.pathname + window.location.search)
  try {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (error) mailLink.set(error.message)
  } catch (e) {
    mailLink.set(e instanceof Error ? e.message : 'this link is no longer valid')
  }
}

export const isRemote = supabase !== null

/** Absolute base of the Supabase API, for building verify links in the UI. */
export const supabaseBase = rawUrl ? resolveUrl(rawUrl).replace(/\/$/, '') : null

/**
 * Origin a confirm/recovery link should land on. Must be the *app's* own base,
 * not `window.location.origin`: on a GitHub Pages project page the app is served
 * from `/orbit/`, so the bare origin would drop the user on a 404 after they
 * click the mail. `import.meta.env.BASE_URL` is `/orbit/` in that build and `/`
 * everywhere else. Trailing slash is required — Supabase rejects redirect URLs
 * without one when they include a path.
 */
export const appOrigin = new URL(import.meta.env.BASE_URL, window.location.origin).toString()

/** Rough health of the remote link, shown in the HUD's link indicator. */
export type LinkStatus = 'offline' | 'connecting' | 'online' | 'error'
