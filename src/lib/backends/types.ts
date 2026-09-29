import type { GalaxyState } from '../../types'

/**
 * Everything the store needs from a data source. Two implementations exist:
 * `LocalBackend` (localStorage, the offline demo) and `SupabaseBackend` (the
 * real multi-user galaxy). The store only ever talks to this interface, so the
 * React tree does not care which one is live.
 *
 * Every method returns the fresh `GalaxyState` so the store can replace its copy
 * wholesale; every method may throw, and the store turns the message into an
 * on-screen error.
 */
export interface Backend {
  readonly name: 'local' | 'supabase'
  /** Load the galaxy and restore any existing session. */
  init(): Promise<GalaxyState>
  /** Create a new planet. */
  signUp(email: string, password: string, name: string, planetVariant: number): Promise<GalaxyState>
  /** Sign in with email + password. */
  signIn(email: string, password: string): Promise<GalaxyState>
  /**
   * Enter as a visitor without owning credentials. `targetUserId` is the demo
   * planet the visitor tapped, so the app can fly straight to it.
   */
  signInVisitor(targetUserId: string): Promise<GalaxyState>
  signOut(): Promise<void>
  /** Attach credentials to the current planet — turns a visitor into an owner. */
  linkEmail(email: string, password: string): Promise<GalaxyState>
  /**
   * Ask for a password-recovery link by email. Returns a human-readable error,
   * or null on success. The offline backend cannot send mail.
   */
  resetPassword(email: string): Promise<string | null>
  /** Change the signed-in account's password (used to finish a recovery). */
  setPassword(password: string): Promise<string | null>
  updateProfile(patch: { name?: string; bio?: string }): Promise<GalaxyState>
  createPost(text: string, image?: string): Promise<GalaxyState>
  deletePost(id: string): Promise<GalaxyState>
  toggleLike(postId: string): Promise<GalaxyState>
  addSignal(postId: string, text: string): Promise<GalaxyState>
  toggleFollow(userId: string): Promise<GalaxyState>
  toggleSave(postId: string): Promise<GalaxyState>
  /** Re-read the galaxy from the source. */
  refresh(): Promise<GalaxyState>
  /** Discard local state and rebuild — the offline "reset galaxy" affordance. */
  reset(): Promise<GalaxyState>
}
