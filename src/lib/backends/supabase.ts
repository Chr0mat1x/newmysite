import type { GalaxyState, MessageRow, PlanetRow, SatelliteRow, SignalRow, StarRow } from '../../types'
import { supabase } from '../supabase'
import { buildState } from '../mappers'
import { planetSeed } from '../seed'
import { handleFromIdentity, normalizeEmail } from '../auth'
import type { Backend, SignUpResult } from './types'

/**
 * The real, multi-user galaxy. Auth is Supabase Auth; posts, signals, stars and
 * follows live in Postgres behind RLS (see supabase/migrations). The supernova
 * threshold is applied by a database trigger, not by the browser.
 *
 * After each write the affected tables are re-read rather than patched locally.
 * The demo galaxy is small (hundreds of rows), so a full re-read keeps the client
 * correct with far less code than surgical cache surgery — revisit if ORBIT ever
 * holds thousands of satellites.
 */
export class SupabaseBackend implements Backend {
  readonly name = 'supabase' as const
  private currentUserId: string | null = null

  private get client() {
    if (!supabase) throw new Error('supabase is not configured')
    return supabase
  }

  private async requireUserId(): Promise<string> {
    if (!this.currentUserId) throw new Error('you are not signed in')
    return this.currentUserId
  }

  private async loadAll(): Promise<GalaxyState> {
    const [planets, satellites, signals, stars, messages] = await Promise.all([
      this.client.from('planets').select('*'),
      this.client.from('satellites').select('*'),
      this.client.from('signals').select('*'),
      this.client.from('stars').select('*'),
      // RLS already narrows this to the caller's own threads, so no filter here
      this.currentUserId
        ? this.client.from('messages').select('*')
        : Promise.resolve({ data: [], error: null }),
    ])
    const err = planets.error || satellites.error || signals.error || stars.error || messages.error
    if (err) throw new Error(err.message)
    return buildState(
      (planets.data ?? []) as PlanetRow[],
      (satellites.data ?? []) as SatelliteRow[],
      (signals.data ?? []) as SignalRow[],
      (stars.data ?? []) as StarRow[],
      this.currentUserId,
      (messages.data ?? []) as MessageRow[],
    )
  }

  async init() {
    const { data } = await this.client.auth.getSession()
    this.currentUserId = data.session?.user.id ?? null
    return this.loadAll()
  }

  async signUp(
    email: string,
    password: string,
    name: string,
    planetVariant: number,
    preferredHandle?: string,
  ): Promise<SignUpResult> {
    const mail = normalizeEmail(email)
    const label = name.trim() || mail.split('@')[0] || 'traveler'

    const requested = preferredHandle?.trim().toLowerCase()
    if (requested) {
      if (!/^[a-z0-9_]{3,20}$/.test(requested)) {
        throw new Error('handles are 3-20 characters: letters, numbers and _')
      }
      const { data: free, error: checkError } = await this.client.rpc('handle_available', { desired: requested })
      if (checkError) throw new Error(checkError.message)
      if (free === false) throw new Error(`@${requested} is already orbiting — pick another`)
    }

    // reserve a handle locally so the planet's procedural seed matches the
    // handle the database is about to grant (it appends a suffix on collision)
    const { data: existing } = await this.client.from('planets').select('handle')
    const taken = new Set((existing ?? []).map((r) => (r as { handle: string }).handle.toLowerCase()))
    const handle = requested || handleFromIdentity(label, mail, taken)

    const { data, error } = await this.client.auth.signUp({
      email: mail,
      password,
      options: {
        data: { handle, name: label, seed: String(planetSeed(handle, label, planetVariant)) },
      },
    })
    if (error) throw new Error(this.friendlyAuthError(error.message))
    // With confirmations on there is no session yet, and Supabase deliberately
    // returns a bare user for an address that already exists (so signup cannot
    // be used to enumerate accounts). Both cases end on the same screen.
    if (!data.session) return { status: 'confirm', email: mail }
    this.currentUserId = data.session.user.id
    return { status: 'active', state: await this.loadAll() }
  }

  /** Re-send the signup confirmation mail for an address that never verified. */
  async resendConfirmation(email: string): Promise<string | null> {
    const { error } = await this.client.auth.resend({
      type: 'signup',
      email: normalizeEmail(email),
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) return this.friendlyAuthError(error.message)
    return null
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    })
    if (error) throw new Error(this.friendlyAuthError(error.message))
    this.currentUserId = data.session?.user.id ?? null
    return this.loadAll()
  }

  async signInVisitor(_targetUserId: string) {
    // The signup trigger creates a planet for every auth user, anonymous ones
    // included, so pass the identity metadata here and let the database do it.
    const handle = `wanderer${Math.floor(Math.random() * 900 + 100)}`
    const { data, error } = await this.client.auth.signInAnonymously({
      options: { data: { handle, name: 'Wanderer', bio: 'Just passing through the galaxy.', seed: String(planetSeed(handle, 'Wanderer', 0)) } },
    })
    if (error) throw new Error(error.message)
    if (!data.session?.user.id) throw new Error('could not start a visitor session')
    this.currentUserId = data.session.user.id
    return this.loadAll()
  }

  async signOut() {
    const { error } = await this.client.auth.signOut()
    if (error) throw new Error(error.message)
    this.currentUserId = null
  }

  async linkEmail(email: string, password: string) {
    const { error } = await this.client.auth.updateUser({ email: normalizeEmail(email), password })
    if (error) throw new Error(this.friendlyAuthError(error.message))
    return this.loadAll()
  }

  async resetPassword(email: string): Promise<string | null> {
    const mail = normalizeEmail(email)
    if (!mail) return 'enter the email you signed up with'
    const { error } = await this.client.auth.resetPasswordForEmail(mail, {
      redirectTo: window.location.origin,
    })
    if (error) return this.friendlyAuthError(error.message)
    return null
  }

  /** Finish a recovery flow: the link already granted a session. */
  async setPassword(password: string): Promise<string | null> {
    if (password.length < 8) return 'password needs at least 8 characters'
    const { error } = await this.client.auth.updateUser({ password })
    if (error) return this.friendlyAuthError(error.message)
    return null
  }

  /**
   * Change the account email. Supabase mails a confirmation link to the *new*
   * address and keeps the old one active until it is opened, so this resolves as
   * soon as the request is accepted rather than when the change lands.
   */
  async changeEmail(email: string): Promise<string | null> {
    const mail = normalizeEmail(email)
    if (!mail) return 'enter a valid email address'
    const { error } = await this.client.auth.updateUser(
      { email: mail },
      { emailRedirectTo: window.location.origin },
    )
    if (error) return this.friendlyAuthError(error.message)
    return null
  }

  /**
   * Change the password from a live session. Supabase has no "verify current
   * password" endpoint, so we prove ownership by re-authenticating first: a
   * wrong current password fails the sign-in and nothing is written.
   */
  async changePassword(current: string, next: string): Promise<string | null> {
    if (next.length < 8) return 'password needs at least 8 characters'
    if (current === next) return 'the new key matches the old one'
    const { data: session } = await this.client.auth.getSession()
    const mail = session.session?.user.email
    if (!mail) return 'you are not signed in'
    const { error: reauth } = await this.client.auth.signInWithPassword({ email: mail, password: current })
    if (reauth) return 'the current key is wrong'
    const { error } = await this.client.auth.updateUser({ password: next })
    if (error) return this.friendlyAuthError(error.message)
    return null
  }

  /** Revoke every refresh token for this account; other devices drop on next call. */
  async signOutEverywhere(): Promise<string | null> {
    const { error } = await this.client.auth.signOut({ scope: 'global' })
    if (error) return this.friendlyAuthError(error.message)
    this.currentUserId = null
    return null
  }

  /**
   * Delete the planet and the account behind it. `delete_me` removes the auth
   * user, so there is no session left to revoke — calling signOut would only
   * POST a token that no longer resolves and surface a spurious error.
   */
  async deleteAccount(): Promise<string | null> {
    const { error } = await this.client.rpc('delete_me')
    if (error) return this.friendlyAuthError(error.message)
    this.currentUserId = null
    return null
  }

  async updateProfile(patch: { name?: string; bio?: string }) {
    const me = await this.requireUserId()
    const update: Record<string, string> = {}
    if (patch.name !== undefined) update.name = patch.name
    if (patch.bio !== undefined) update.bio = patch.bio
    const { error } = await this.client.from('planets').update(update).eq('id', me)
    if (error) throw new Error(error.message)
    return this.loadAll()
  }

  async createPost(text: string, image?: string) {
    const me = await this.requireUserId()
    const body = text.trim()
    const pic = image?.trim() || null
    if (!body && !pic) throw new Error('a satellite needs text or an image')
    const { error } = await this.client
      .from('satellites')
      .insert({ author: me, body, image: pic, kind: pic ? 'image' : 'text' })
    if (error) throw new Error(error.message)
    return this.loadAll()
  }

  async deletePost(id: string) {
    await this.requireUserId()
    const { error } = await this.client.from('satellites').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return this.loadAll()
  }

  async toggleLike(postId: string) {
    const me = await this.requireUserId()
    const { data: existing } = await this.client
      .from('stars')
      .select('satellite')
      .eq('satellite', postId)
      .eq('planet', me)
      .maybeSingle()

    // deleting or inserting the star is what makes the supernova trigger fire
    const op = existing
      ? this.client.from('stars').delete().eq('satellite', postId).eq('planet', me)
      : this.client.from('stars').insert({ satellite: postId, planet: me })
    const { error } = await op
    if (error) throw new Error(error.message)
    return this.loadAll()
  }

  async addSignal(postId: string, text: string) {
    const me = await this.requireUserId()
    const body = text.trim()
    if (!body) throw new Error('a signal needs words')
    const { error } = await this.client
      .from('signals')
      .insert({ satellite: postId, author: me, body, phase: Math.random() * Math.PI * 2 })
    if (error) throw new Error(error.message)
    return this.loadAll()
  }

  async toggleFollow(userId: string) {
    await this.requireUserId()
    const { data: me, error: readError } = await this.client
      .from('planets')
      .select('following')
      .eq('id', this.currentUserId!)
      .single()
    if (readError) throw new Error(readError.message)
    const following: string[] = (me as { following: string[] | null }).following ?? []
    const next = following.includes(userId)
      ? following.filter((f) => f !== userId)
      : [...following, userId]
    const { error } = await this.client.from('planets').update({ following: next }).eq('id', this.currentUserId!)
    if (error) throw new Error(error.message)
    return this.loadAll()
  }

  async toggleSave(postId: string) {
    await this.requireUserId()
    const { data: me, error: readError } = await this.client
      .from('planets')
      .select('saved')
      .eq('id', this.currentUserId!)
      .single()
    if (readError) throw new Error(readError.message)
    const saved: string[] = (me as { saved: string[] | null }).saved ?? []
    const next = saved.includes(postId) ? saved.filter((s) => s !== postId) : [...saved, postId]
    const { error } = await this.client.from('planets').update({ saved: next }).eq('id', this.currentUserId!)
    if (error) throw new Error(error.message)
    return this.loadAll()
  }

  async sendMessage(to: string, text: string) {
    const me = await this.requireUserId()
    const body = text.trim()
    if (!body) throw new Error('a transmission needs words')
    if (to === me) throw new Error('you cannot message your own planet')
    // RLS would refuse a forged sender anyway; this turns that into a clear
    // message instead of an opaque policy violation.
    const { error } = await this.client.from('messages').insert({ sender: me, recipient: to, body })
    if (error) throw new Error(error.message)
    return this.loadAll()
  }

  async readThread(peerId: string) {
    const me = await this.requireUserId()
    // only messages the peer sent me: the update policy is recipient-only, so
    // anything else would be silently dropped by RLS
    const { error } = await this.client
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender', peerId)
      .eq('recipient', me)
      .is('read_at', null)
    if (error) throw new Error(error.message)
    return this.loadAll()
  }

  async refresh() {
    return this.loadAll()
  }

  /** Nothing to discard server-side — this only re-reads the shared galaxy. */
  async reset() {
    return this.loadAll()
  }

  /** Who is signed in right now, as far as the remote session is concerned. */
  async sessionUserId(): Promise<string | null> {
    const { data } = await this.client.auth.getSession()
    return data.session?.user.id ?? null
  }

  /** Maps Supabase's terse auth messages onto the copy the UI has always shown. */
  private friendlyAuthError(message: string): string {
    const m = message.toLowerCase()
    if (m.includes('invalid login credentials')) return 'wrong email or password — try again'
    if (m.includes('email not confirmed')) return 'this email is not confirmed yet — open the link we sent'
    if (m.includes('already registered') || m.includes('already been registered')) {
      return 'this email already has a planet — sign in instead'
    }
    if (m.includes('password should be at least')) return 'password needs at least 8 characters'
    if (m.includes('different password') || m.includes('same as the old')) return 'the new key must differ from the old one'
    if (m.includes('email') && m.includes('invalid')) return 'enter a valid email address'
    return message
  }
}
