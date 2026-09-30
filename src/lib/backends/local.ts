import type { GalaxyState, Post, User } from '../../types'
import { SUPERNOVA_THRESHOLD, SUPERNOVA_TTL } from '../../types'
import { loadState, saveState, uid } from '../storage'
import { buildSeedGalaxy, makeUser } from '../seed'
import { hashPassword, handleFromIdentity, isValidEmail, isValidPassword, normalizeEmail, verifyPassword } from '../auth'
import { reducer, type Action } from '../../state/reducer'
import type { Backend, SignUpResult } from './types'

/**
 * The original single-browser galaxy. Keeps working when Supabase is not
 * configured, so ORBIT is always runnable as a local demo.
 */
export class LocalBackend implements Backend {
  readonly name = 'local' as const
  private state: GalaxyState

  constructor() {
    this.state = loadState() ?? buildSeedGalaxy()
  }

  private apply(action: Action): GalaxyState {
    this.state = reducer(this.state, action)
    saveState(this.state)
    return this.state
  }

  private require(): User {
    const me = this.state.currentUserId ? this.state.users[this.state.currentUserId] : null
    if (!me) throw new Error('you are not signed in')
    return me
  }

  async init() {
    return this.state
  }

  async signUp(
    email: string,
    password: string,
    name: string,
    planetVariant: number,
    preferredHandle?: string,
  ): Promise<SignUpResult> {
    const mail = normalizeEmail(email)
    if (!isValidEmail(mail)) throw new Error('enter a valid email address')
    if (!isValidPassword(password)) throw new Error('password needs at least 8 characters')
    if (Object.values(this.state.users).some((u) => !u.mock && u.email === mail)) {
      throw new Error('this email already has a planet — sign in instead')
    }
    const label = name.trim() || mail.split('@')[0]
    const taken = new Set(Object.values(this.state.users).map((u) => u.handle.toLowerCase()))
    const requested = preferredHandle?.trim()
    if (requested) {
      if (!/^[a-z0-9_]{3,20}$/.test(requested)) {
        throw new Error('handles are 3-20 characters: letters, numbers and _')
      }
      if (taken.has(requested)) throw new Error(`@${requested} is already orbiting — pick another`)
    }
    const handle = requested || handleFromIdentity(label, mail, taken)
    const base = makeUser(handle, label, planetVariant)
    const user: User = { ...base, email: mail, passwordHash: hashPassword(password, base.id) }
    // the offline galaxy has no mail to confirm, so a signup is always active
    return { status: 'active', state: this.apply({ type: 'login', user }) }
  }

  /** No mail server offline: nothing to re-send, and no way to have a pending account. */
  async resendConfirmation(): Promise<string | null> {
    return 'this build is offline — there is no confirmation mail to send'
  }

  async signIn(email: string, password: string) {
    const mail = normalizeEmail(email)
    if (!isValidEmail(mail)) throw new Error('enter a valid email address')
    const user = Object.values(this.state.users).find((u) => !u.mock && u.email === mail)
    if (!user || !user.passwordHash) throw new Error('no planet orbits this email yet')
    if (!verifyPassword(password, user.id, user.passwordHash)) throw new Error('wrong password — try again')
    return this.apply({ type: 'login', user })
  }

  async signInVisitor(targetUserId: string) {
    const user = this.state.users[targetUserId]
    if (!user) throw new Error('no such planet')
    return this.apply({ type: 'login', user })
  }

  async signOut() {
    this.apply({ type: 'logout' })
  }

  async linkEmail(email: string, password: string) {
    const me = this.require()
    const mail = normalizeEmail(email)
    if (!isValidEmail(mail)) throw new Error('enter a valid email address')
    if (!isValidPassword(password)) throw new Error('password needs at least 8 characters')
    if (Object.values(this.state.users).some((u) => u.id !== me.id && !u.mock && u.email === mail)) {
      throw new Error('another planet already uses this email')
    }
    return this.apply({
      type: 'linkEmail',
      userId: me.id,
      email: mail,
      passwordHash: hashPassword(password, me.id),
    })
  }

  async resetPassword(email: string): Promise<string | null> {
    // Nothing to send: this backend has no server, accounts never left the
    // browser, and there is no way to prove the caller owns the address.
    const mail = normalizeEmail(email)
    if (!isValidEmail(mail)) return 'enter a valid email address'
    return 'this offline build cannot send email — reset is only available against Supabase'
  }

  async setPassword(password: string): Promise<string | null> {
    const me = this.require()
    if (!isValidPassword(password)) return 'password needs at least 8 characters'
    this.apply({ type: 'linkEmail', userId: me.id, email: me.email ?? '', passwordHash: hashPassword(password, me.id) })
    return null
  }

  async updateProfile(patch: { name?: string; bio?: string }) {
    this.require()
    return this.apply({ type: 'updateUser', patch })
  }

  async createPost(text: string, image?: string) {
    const me = this.require()
    const body = text.trim()
    if (!body && !image) throw new Error('a satellite needs text or an image')
    const post: Post = {
      id: uid(),
      authorId: me.id,
      text: body,
      image: image?.trim() || undefined,
      createdAt: Date.now(),
      likes: [],
      signals: [],
      supernovaAt: null,
      kind: image ? 'image' : 'text',
    }
    return this.apply({ type: 'addPost', post })
  }

  async deletePost(id: string) {
    this.require()
    return this.apply({ type: 'deletePost', id })
  }

  async toggleLike(postId: string) {
    const me = this.require()
    if (!this.state.posts[postId]) throw new Error('no such satellite')
    return this.apply({ type: 'toggleLike', postId, userId: me.id })
  }

  async addSignal(postId: string, text: string) {
    const me = this.require()
    if (!text.trim()) throw new Error('a signal needs words')
    return this.apply({ type: 'addSignal', postId, signal: { id: uid(), authorId: me.id, text: text.trim() } })
  }

  async toggleFollow(userId: string) {
    this.require()
    return this.apply({ type: 'toggleFollow', userId })
  }

  async toggleSave(postId: string) {
    this.require()
    return this.apply({ type: 'toggleSave', postId })
  }

  async refresh() {
    return this.state
  }

  /** Wipe back to the seeded galaxy — the "reset galaxy" affordance. */
  async reset() {
    this.state = buildSeedGalaxy()
    saveState(this.state)
    return this.state
  }
}

export { SUPERNOVA_TTL }
