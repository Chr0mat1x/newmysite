import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { GalaxyState, Post, Signal, User } from '../types'
import { SUPERNOVA_TTL } from '../types'
import { LocalBackend } from '../lib/backends/local'
import { SupabaseBackend } from '../lib/backends/supabase'
import type { Backend } from '../lib/backends/types'
import { isRemote, recovery, type LinkStatus } from '../lib/supabase'
import { sfx } from '../lib/audio'

// Pick the backend once, at module load. `isRemote` is decided by whether the
// VITE_SUPABASE_* env vars were present at build time.
const backend: Backend = isRemote ? new SupabaseBackend() : new LocalBackend()

function emptyGalaxy(): GalaxyState {
  return { version: 1, users: {}, posts: {}, currentUserId: null }
}

const message = (e: unknown): string => (e instanceof Error ? e.message : 'something went wrong')

interface Ctx {
  state: GalaxyState
  currentUser: User | null
  users: User[]
  postsOf: (userId: string) => Post[]
  postById: (id: string) => Post | undefined
  userById: (id: string) => User | undefined
  supernovas: Post[]
  /** which data source is live, for the HUD link indicator */
  mode: 'local' | 'supabase'
  linkStatus: LinkStatus
  /** a write or load is in flight */
  busy: boolean
  /** true once the first galaxy load has completed (splash can go away) */
  ready: boolean
  /** a recovery link was opened and the user still has to pick a new key */
  recovering: boolean
  /** the most recent failure, already human-readable */
  lastError: string | null
  clearLastError: () => void
  /** set after a visitor enters, so the camera can fly to the planet they picked */
  initialFocus: string | null
  clearInitialFocus: () => void
  /** Sign in with email + password. Returns an error message, or null on success. */
  login: (email: string, password: string) => Promise<string | null>
  /** Create a new planet. Returns an error message, or null on success. */
  signUp: (email: string, password: string, name: string, planetVariant?: number) => Promise<string | null>
  /** Enter as an existing planet without credentials (seeded demo accounts). */
  loginAs: (userId: string) => Promise<string | null>
  /** Attach an email + password to the current account. Returns an error or null. */
  linkEmail: (email: string, password: string) => Promise<string | null>
  /** Request a password-recovery email. Returns an error string, or null on success. */
  resetPassword: (email: string) => Promise<string | null>
  /** Change the signed-in account's password (finishes a recovery). */
  setPassword: (password: string) => Promise<string | null>
  /** Re-read the galaxy from the source. */
  refresh: () => Promise<boolean>
  logout: () => void
  updateProfile: (patch: Partial<User>) => void
  createPost: (text: string, image?: string) => void
  deletePost: (id: string) => void
  toggleLike: (postId: string) => void
  addSignal: (postId: string, text: string) => void
  toggleFollow: (userId: string) => void
  toggleSave: (postId: string) => void
  /** Users the current planet follows. */
  following: User[]
  /** Posts the current planet has bookmarked, newest first. */
  savedPosts: Post[]
  /** Recent signals other planets left on the current planet's posts. */
  transmissions: { signal: Signal; post: Post; user: User }[]
  resetGalaxy: () => void
}

const GalaxyContext = createContext<Ctx | null>(null)

export function GalaxyProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(
    (s: GalaxyState, a: GalaxyState | { type: 'hydrate'; state: GalaxyState }) =>
      'type' in a ? a.state : a,
    undefined,
    emptyGalaxy,
  )
  const [busy, setBusy] = useState(true)
  const [ready, setReady] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  // mirrors the recovery flag so the auth gate can stay on the "set a new key"
  // screen even though the recovery link has already signed the user in
  const [recovering, setRecovering] = useState(recovery.pending)
  const [linkStatus, setLinkStatus] = useState<LinkStatus>(isRemote ? 'connecting' : 'offline')
  const [initialFocus, setInitialFocus] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /** Runs a backend call, pushing its result into state and surfacing failures. */
  const run = useCallback(async (fn: () => Promise<GalaxyState>): Promise<boolean> => {
    setBusy(true)
    try {
      const next = await fn()
      if (mounted.current) {
        // A recovery link already grants a session, but the user has to choose a
        // new key first; holding the galaxy back keeps the auth gate mounted.
        if (recovery.pending && next.currentUserId) return true
        dispatch({ type: 'hydrate', state: next })
        setLastError(null)
        if (isRemote) setLinkStatus('online')
      }
      return true
    } catch (e) {
      if (mounted.current) {
        setLastError(message(e))
        if (isRemote) setLinkStatus('error')
      }
      return false
    } finally {
      if (mounted.current) setBusy(false)
    }
  }, [])

  // The recovery link's auth event may fire before this provider subscribes,
  // so sync once on mount and then follow later changes.
  useEffect(() => recovery.subscribe(() => setRecovering(recovery.pending)), [])

  // initial load — `ready` flips once and stays, so the splash never unmounts the
  // auth form mid-request (which would wipe a failed sign-in's error message)
  useEffect(() => {
    void run(() => backend.init()).finally(() => {
      if (mounted.current) setReady(true)
    })
  }, [run])

  // supernova decay & fresh signals — re-read periodically from the source
  useEffect(() => {
    const t = setInterval(() => {
      void backend.refresh().then((next) => {
        if (mounted.current) dispatch({ type: 'hydrate', state: next })
      })
    }, 60000)
    return () => clearInterval(t)
  }, [])

  const users = useMemo(() => Object.values(state.users), [state.users])

  const postsOf = useCallback(
    (userId: string) =>
      Object.values(state.posts)
        .filter((p) => p.authorId === userId)
        .sort((a, b) => b.createdAt - a.createdAt),
    [state.posts],
  )

  const postById = useCallback((id: string) => state.posts[id], [state.posts])
  const userById = useCallback((id: string) => state.users[id], [state.users])

  const supernovas = useMemo(
    () =>
      Object.values(state.posts)
        .filter((p) => p.supernovaAt && Date.now() - p.supernovaAt < SUPERNOVA_TTL)
        .sort((a, b) => (b.supernovaAt ?? 0) - (a.supernovaAt ?? 0)),
    [state.posts],
  )

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    setBusy(true)
    try {
      const next = await backend.signIn(email, password)
      dispatch({ type: 'hydrate', state: next })
      if (isRemote) setLinkStatus('online')
      sfx.launch()
      return null
    } catch (e) {
      return message(e)
    } finally {
      setBusy(false)
    }
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, name: string, planetVariant = 0): Promise<string | null> => {
      setBusy(true)
      try {
        const next = await backend.signUp(email, password, name, planetVariant)
        dispatch({ type: 'hydrate', state: next })
        if (isRemote) setLinkStatus('online')
        sfx.launch()
        return null
      } catch (e) {
        return message(e)
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const loginAs = useCallback(async (userId: string): Promise<string | null> => {
    setBusy(true)
    try {
      const next = await backend.signInVisitor(userId)
      dispatch({ type: 'hydrate', state: next })
      if (isRemote) setLinkStatus('online')
      // Offline you literally become the demo planet; online you are a visitor
      // with your own world and the camera flies to the one you tapped.
      if (isRemote) setInitialFocus(userId)
      sfx.launch()
      return null
    } catch (e) {
      return message(e)
    } finally {
      setBusy(false)
    }
  }, [])

  const linkEmail = useCallback(async (email: string, password: string): Promise<string | null> => {
    setBusy(true)
    try {
      const next = await backend.linkEmail(email, password)
      dispatch({ type: 'hydrate', state: next })
      return null
    } catch (e) {
      return message(e)
    } finally {
      setBusy(false)
    }
  }, [])

  const resetPassword = useCallback(async (email: string): Promise<string | null> => {
    setBusy(true)
    try {
      return await backend.resetPassword(email)
    } catch (e) {
      return message(e)
    } finally {
      setBusy(false)
    }
  }, [])

  const setPassword = useCallback(async (password: string): Promise<string | null> => {
    setBusy(true)
    try {
      const err = await backend.setPassword(password)
      // finishing the recovery hands control back to the galaxy
      if (!err) recovery.set(false)
      return err
    } catch (e) {
      return message(e)
    } finally {
      setBusy(false)
    }
  }, [])

  /** Re-read the galaxy from the source, e.g. after an out-of-band auth change. */
  const refresh = useCallback(() => run(() => backend.refresh()), [run])

  const logout = useCallback(() => {
    sfx.click()
    // Clearing to an empty galaxy would leave the auth gate with no planets to
    // explore, so re-read the public galaxy once the session is gone.
    void backend
      .signOut()
      .then(() => backend.refresh())
      .then((next) => dispatch({ type: 'hydrate', state: next }))
      .catch(() => dispatch({ type: 'hydrate', state: emptyGalaxy() }))
  }, [])

  const updateProfile = useCallback((patch: Partial<User>) => void run(() => backend.updateProfile(patch)), [run])

  const createPost = useCallback(
    (text: string, image?: string) => void run(() => backend.createPost(text, image)),
    [run],
  )
  const deletePost = useCallback((id: string) => void run(() => backend.deletePost(id)), [run])
  const toggleLike = useCallback((postId: string) => void run(() => backend.toggleLike(postId)), [run])
  const addSignal = useCallback((postId: string, text: string) => void run(() => backend.addSignal(postId, text)), [run])
  const toggleFollow = useCallback((userId: string) => void run(() => backend.toggleFollow(userId)), [run])
  const toggleSave = useCallback((postId: string) => void run(() => backend.toggleSave(postId)), [run])

  const resetGalaxy = useCallback(() => {
    void run(() => backend.reset())
  }, [run])

  const clearLastError = useCallback(() => setLastError(null), [])
  const clearInitialFocus = useCallback(() => setInitialFocus(null), [])

  const currentUser = state.currentUserId ? state.users[state.currentUserId] ?? null : null

  const following = useMemo(() => {
    const ids = currentUser?.following ?? []
    return ids.map((id) => state.users[id]).filter((u): u is User => !!u)
  }, [currentUser, state.users])

  const savedPosts = useMemo(() => {
    const ids = currentUser?.saved ?? []
    return ids
      .map((id) => state.posts[id])
      .filter((p): p is Post => !!p)
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [currentUser, state.posts])

  const transmissions = useMemo(() => {
    if (!currentUser) return []
    const out: { signal: Signal; post: Post; user: User }[] = []
    for (const post of Object.values(state.posts)) {
      if (post.authorId !== currentUser.id) continue
      for (const signal of post.signals) {
        if (signal.authorId === currentUser.id) continue
        const user = state.users[signal.authorId]
        if (user) out.push({ signal, post, user })
      }
    }
    return out.sort((a, b) => b.signal.createdAt - a.signal.createdAt).slice(0, 40)
  }, [currentUser, state.posts, state.users])

  const value: Ctx = {
    state,
    currentUser,
    users,
    postsOf,
    postById,
    userById,
    supernovas,
    mode: backend.name,
    linkStatus,
    busy,
    ready,
    recovering,
    lastError,
    clearLastError,
    initialFocus,
    clearInitialFocus,
    login,
    signUp,
    loginAs,
    linkEmail,
    resetPassword,
    setPassword,
    refresh,
    logout,
    updateProfile,
    createPost,
    deletePost,
    toggleLike,
    addSignal,
    toggleFollow,
    toggleSave,
    following,
    savedPosts,
    transmissions,
    resetGalaxy,
  }

  return <GalaxyContext.Provider value={value}>{children}</GalaxyContext.Provider>
}

export function useGalaxy() {
  const ctx = useContext(GalaxyContext)
  if (!ctx) throw new Error('useGalaxy must be used inside <GalaxyProvider>')
  return ctx
}
