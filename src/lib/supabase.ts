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

export const isRemote = supabase !== null

/**
 * The local stack ships a mail catcher (Inbucket/Mailpit) instead of an SMTP
 * server, so recovery mail never reaches a real inbox. When Supabase is reached
 * through the `/sb` proxy we also expose the catcher at `/mb` so the UI can show
 * those messages. Hosted projects have no catcher and this is null.
 */
export const mailCatcherUrl: string | null =
  rawUrl && anonKey && !/^https?:\/\//i.test(rawUrl)
    ? new URL(rawUrl.replace(/\/sb\/?$/, '/mb'), window.location.origin).toString().replace(/\/$/, '')
    : null

/** Absolute base of the Supabase API, for building verify links in the UI. */
export const supabaseBase = rawUrl ? resolveUrl(rawUrl).replace(/\/$/, '') : null

/** Rough health of the remote link, shown in the HUD's link indicator. */
export type LinkStatus = 'offline' | 'connecting' | 'online' | 'error'
