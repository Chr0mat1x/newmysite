import type { Cluster, GalaxyState, Message, Post, User } from '../../types'
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

  async verifyEmailCode(): Promise<{ error: string | null; state: null }> {
    return { error: 'this build is offline — there is no email code to enter', state: null }
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

  /** Offline accounts are just rows in this browser, so the change is immediate. */
  async changeEmail(email: string): Promise<string | null> {
    const me = this.require()
    const mail = normalizeEmail(email)
    if (!isValidEmail(mail)) return 'enter a valid email address'
    if (Object.values(this.state.users).some((u) => u.id !== me.id && !u.mock && u.email === mail)) {
      return 'another planet already uses this email'
    }
    this.apply({ type: 'linkEmail', userId: me.id, email: mail, passwordHash: me.passwordHash ?? '' })
    return null
  }

  async changePassword(current: string, next: string): Promise<string | null> {
    const me = this.require()
    if (!isValidPassword(next)) return 'password needs at least 8 characters'
    if (!me.passwordHash || !verifyPassword(current, me.id, me.passwordHash)) return 'the current key is wrong'
    if (current === next) return 'the new key matches the old one'
    this.apply({ type: 'linkEmail', userId: me.id, email: me.email ?? '', passwordHash: hashPassword(next, me.id) })
    return null
  }

  /** A single browser holds the only session, so dropping it is the whole job. */
  async signOutEverywhere(): Promise<string | null> {
    this.apply({ type: 'logout' })
    return null
  }

  async deleteAccount(): Promise<string | null> {
    const me = this.require()
    this.apply({ type: 'deleteUser', id: me.id })
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

  async sendMessage(to: string, text: string, image?: string) {
    const me = this.require()
    const body = text.trim()
    const pic = image?.trim() || undefined
    if (!body && !pic) throw new Error('a transmission needs words or an image')
    if (to === me.id) throw new Error('you cannot message your own planet')
    const peer = this.state.users[to]
    if (!peer) throw new Error('no such planet')
    // Demo planets have no account behind them, so nothing could ever read it.
    if (peer.mock) throw new Error(`${peer.name} is a demo planet — it cannot answer`)
    const message: Message = { id: uid(), from: me.id, to, text: body, image: pic, createdAt: Date.now(), readAt: null }
    return this.apply({ type: 'addMessage', message })
  }

  async readThread(peerId: string) {
    const me = this.require()
    return this.apply({ type: 'readThread', userId: me.id, peerId })
  }

  /** Offline search runs over the planets already in this browser's galaxy. */
  async searchPlanets(term: string) {
    this.require()
    const q = term.trim().toLowerCase()
    if (!q) return []
    return Object.values(this.state.users)
      .filter((u) => u.handle.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const exact = (u: User) => (u.handle.toLowerCase() === q ? 0 : u.handle.toLowerCase().startsWith(q) ? 1 : 2)
        return exact(a) - exact(b) || a.handle.localeCompare(b.handle)
      })
      .slice(0, 20)
  }

  async createCluster(name: string, memberIds: string[]) {
    const me = this.require()
    const label = name.trim()
    if (!label) throw new Error('a cluster needs a name')
    // demo planets cannot read, so seating one would create a silent audience
    const members = [me.id, ...memberIds].filter((id, i, all) => all.indexOf(id) === i)
    const guests = members.filter((id) => this.state.users[id]?.mock)
    if (guests.length) throw new Error('demo planets cannot join a cluster')
    const cluster: Cluster = { id: uid(), name: label.slice(0, 60), creator: me.id, members, createdAt: Date.now() }
    return { state: this.apply({ type: 'addCluster', cluster }), clusterId: cluster.id }
  }

  async sendClusterMessage(clusterId: string, text: string, image?: string) {
    const me = this.require()
    const body = text.trim()
    const pic = image?.trim() || undefined
    if (!body && !pic) throw new Error('a transmission needs words or an image')
    const cluster = this.state.clusters?.[clusterId]
    if (!cluster) throw new Error('no such cluster')
    if (!cluster.members.includes(me.id)) throw new Error('you are not in this cluster')
    const message: Message = {
      id: uid(),
      from: me.id,
      clusterId,
      text: body,
      image: pic,
      createdAt: Date.now(),
      readAt: null,
    }
    return this.apply({ type: 'addClusterMessage', message })
  }

  async readCluster(clusterId: string) {
    const me = this.require()
    return this.apply({ type: 'readCluster', userId: me.id, clusterId })
  }

  async leaveCluster(clusterId: string) {
    const me = this.require()
    return this.apply({ type: 'leaveCluster', userId: me.id, clusterId })
  }

  // No server in the offline demo, so there is nothing to push to. Keep the
  // interface whole so the store can call these unconditionally.
  async savePushSubscription() {}
  async clearPushSubscriptions() {}

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
