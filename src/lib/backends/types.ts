import type { GalaxyState } from '../../types'

/**
 * Signing up does not always end in a session: with email confirmation on, the
 * account exists but the address still has to be verified. The UI shows a
 * "check your inbox" screen in that case instead of dropping into the galaxy.
 */
export type SignUpResult =
  | { status: 'active'; state: GalaxyState }
  | { status: 'confirm'; email: string }

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
  /** Create a new planet. May end in an email-confirmation step instead. */
  signUp(
    email: string,
    password: string,
    name: string,
    planetVariant: number,
    handle?: string,
  ): Promise<SignUpResult>
  /** Re-send the signup confirmation mail. */
  resendConfirmation(email: string): Promise<string | null>
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
  /**
   * Change the account's email. Returns a human-readable error, or null if the
   * change was accepted. With double_confirm_changes on, the address only takes
   * effect after the link in the new inbox is opened — so success here means
   * "pending", not "done".
   */
  changeEmail(email: string): Promise<string | null>
  /** Change the account's password from a signed-in session. */
  changePassword(current: string, next: string): Promise<string | null>
  /** Revoke every session for this account, including this one. */
  signOutEverywhere(): Promise<string | null>
  /** Delete the account and its planet for good. */
  deleteAccount(): Promise<string | null>
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
