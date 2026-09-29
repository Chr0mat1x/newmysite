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
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null

export const isRemote = supabase !== null

/** Rough health of the remote link, shown in the HUD's link indicator. */
export type LinkStatus = 'offline' | 'connecting' | 'online' | 'error'
