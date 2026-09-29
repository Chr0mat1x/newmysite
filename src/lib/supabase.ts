import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase is optional: ORBIT ships as a fully offline demo, so the client is
 * null unless both VITE_SUPABASE_* variables are present at build time.
 * `isRemote` is the single switch the data layer reads.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null

export const isRemote = supabase !== null

/** Rough health of the remote link, shown in the HUD's link indicator. */
export type LinkStatus = 'offline' | 'connecting' | 'online' | 'error'
