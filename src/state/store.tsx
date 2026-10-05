import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Cluster, GalaxyState, Message, Post, Signal, User } from '../types'
import { SUPERNOVA_TTL } from '../types'
import { LocalBackend } from '../lib/backends/local'
import { SupabaseBackend } from '../lib/backends/supabase'
import type { Backend } from '../lib/backends/types'
import { isRemote, recovery, consumeEmailLink, type LinkStatus } from '../lib/supabase'
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
  /** address waiting on a signup confirmation mail, or null */
  pendingConfirmation: string | null
  /** clear the pending-confirmation state (after verifying or giving up) */
  clearPendingConfirmation: () => void
  /** the most recent failure, already human-readable */
  lastError: string | null
  clearLastError: () => void
  /** set after a visitor enters, so the camera can fly to the planet they picked */
  initialFocus: string | null
  clearInitialFocus: () => void
  /** Sign in with email + password. Returns an error message, or null on success. */
  login: (email: string, password: string) => Promise<string | null>
  /**
   * Create a new planet. Returns an error message, or null on success — success
   * meaning either a live session or a pending email confirmation, which the UI
   * tells apart through `pendingConfirmation`.
   */
  signUp: (
    email: string,
    password: string,
    name: string,
    planetVariant?: number,
    handle?: string,
  ) => Promise<string | null>
  /** Re-send the signup confirmation mail. Returns an error, or null. */
  resendConfirmation: (email: string) => Promise<string | null>
  /** Enter as an existing planet without credentials (seeded demo accounts). */
  loginAs: (userId: string) => Promise<string | null>
  /** Attach an email + password to the current account. Returns an error or null. */
  linkEmail: (email: string, password: string) => Promise<string | null>
  /** Request a password-recovery email. Returns an error string, or null on success. */
  resetPassword: (email: string) => Promise<string | null>
  /** Change the signed-in account's password (finishes a recovery). */
  setPassword: (password: string) => Promise<string | null>
  /** Change the account email; resolves once the confirmation mail is requested. */
  changeEmail: (email: string) => Promise<string | null>
  /** Change the password from a live session, proving the current one first. */
  changePassword: (current: string, next: string) => Promise<string | null>
  /** Revoke every session for this account. */
  signOutEverywhere: () => Promise<string | null>
  /** Delete the account and its planet irreversibly. */
  deleteAccount: () => Promise<string | null>
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
  /** Every private thread the current planet is part of, newest activity first. */
  threads: Thread[]
  /** Messages between the current planet and one peer, oldest first. */
  threadWith: (peerId: string) => Message[]
  /** How many unread messages the current planet has, across all peers. */
  unreadCount: number
  /** Send a private message to another planet. Returns an error, or null. */
  sendMessage: (to: string, text: string, image?: string) => Promise<string | null>
  /** Mark a peer's messages to the current planet as read. */
  readThread: (peerId: string) => void
  /** Every cluster the current planet belongs to, newest activity first. */
  clusters: ClusterThread[]
  /** Lines in one cluster, oldest first. */
  clusterMessages: (clusterId: string) => Message[]
  /** How many unread cluster lines the current planet has, across all clusters. */
  clusterUnreadCount: number
  /** Find planets by @handle or name. Resolves to an empty list on failure. */
  searchPlanets: (term: string) => Promise<User[]>
  /** Create a group conversation. Resolves with the new cluster's id, or an error. */
  createCluster: (name: string, memberIds: string[]) => Promise<{ error: string | null; clusterId: string | null }>
  /** Send a line into a cluster. Returns an error, or null. */
  sendClusterMessage: (clusterId: string, text: string, image?: string) => Promise<string | null>
  /** Mark a cluster's other members' lines as read. */
  readCluster: (clusterId: string) => void
  /** Leave a cluster. Returns an error, or null. */
  leaveCluster: (clusterId: string) => Promise<string | null>
  resetGalaxy: () => void
}

/** One private thread, folded from the flat message list for the UI. */
export interface Thread {
  peer: User
  last: Message
  unread: number
}

/** One group conversation, folded from the flat message list for the UI. */
export interface ClusterThread {
  cluster: Cluster
  last: Message | null
  unread: number
  members: User[]
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
  // address waiting on a signup confirmation mail; null once verified or dismissed
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null)
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
    void (async () => {
      // a `#token_hash=…` mail link has to be exchanged for a session before the
      // first read, or the app would load signed out and drop the user
      await consumeEmailLink()
      await run(() => backend.init()).finally(() => {
        if (mounted.current) setReady(true)
      })
    })()
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
      setPendingConfirmation(null)
      dispatch({ type: 'hydrate', state: next })
      if (isRemote) setLinkStatus('online')
      sfx.launch()
      return null
    } catch (e) {
      const text = message(e)
      // Supabase reports an unverified address as "email not confirmed"; point the
      // user at the confirmation screen rather than leaving them stuck here.
      if (/not confirmed/i.test(text)) setPendingConfirmation(email.trim().toLowerCase())
      return text
    } finally {
      setBusy(false)
    }
  }, [])

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      planetVariant = 0,
      handle?: string,
    ): Promise<string | null> => {
      setBusy(true)
      try {
        const result = await backend.signUp(email, password, name, planetVariant, handle)
        if (result.status === 'confirm') {
          // no session yet — the gate shows the "confirm your address" screen
          setPendingConfirmation(result.email)
          sfx.click()
          return null
        }
        setPendingConfirmation(null)
        dispatch({ type: 'hydrate', state: result.state })
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

  const resendConfirmation = useCallback(async (email: string): Promise<string | null> => {
    setBusy(true)
    try {
      return await backend.resendConfirmation(email)
    } catch (e) {
      return message(e)
    } finally {
      setBusy(false)
    }
  }, [])

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

  /**
   * Account self-service. These work off the live session, so they do not go
   * through `run` (which hydrates the galaxy) — they return an error string and
   * the settings panel decides what to show. Deletion and a global sign-out
   * additionally leave the session, so the galaxy is re-read into the empty one.
   */
  const changeEmail = useCallback(async (email: string): Promise<string | null> => {
    try {
      return await backend.changeEmail(email)
    } catch (e) {
      return message(e)
    }
  }, [])

  const changePassword = useCallback(async (current: string, next: string): Promise<string | null> => {
    try {
      return await backend.changePassword(current, next)
    } catch (e) {
      return message(e)
    }
  }, [])

  const signOutEverywhere = useCallback(async (): Promise<string | null> => {
    try {
      const err = await backend.signOutEverywhere()
      if (err) return err
      const next = await backend.refresh()
      if (mounted.current) dispatch({ type: 'hydrate', state: next })
      return null
    } catch (e) {
      return message(e)
    }
  }, [])

  const deleteAccount = useCallback(async (): Promise<string | null> => {
    try {
      const err = await backend.deleteAccount()
      if (err) return err
      const next = await backend.refresh()
      if (mounted.current) dispatch({ type: 'hydrate', state: next })
      return null
    } catch (e) {
      return message(e)
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

  const sendMessage = useCallback(
    async (to: string, text: string, image?: string): Promise<string | null> => {
      setBusy(true)
      try {
        const next = await backend.sendMessage(to, text, image)
        if (mounted.current) {
          dispatch({ type: 'hydrate', state: next })
          setLastError(null)
        }
        sfx.ping()
        return null
      } catch (e) {
        return message(e)
      } finally {
        if (mounted.current) setBusy(false)
      }
    },
    [],
  )

  const readThread = useCallback((peerId: string) => {
    void backend.readThread(peerId).catch(() => {
      // a failed read-receipt is cosmetic; the thread is still on screen
    })
  }, [])

  const resetGalaxy = useCallback(() => {
    void run(() => backend.reset())
  }, [run])

  const clearLastError = useCallback(() => setLastError(null), [])
  const clearInitialFocus = useCallback(() => setInitialFocus(null), [])
  const clearPendingConfirmation = useCallback(() => setPendingConfirmation(null), [])

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

  /** Every direct message the current planet is part of, either direction. */
  const myMessages = useMemo(() => {
    if (!currentUser) return [] as Message[]
    return Object.values(state.messages ?? {}).filter(
      (m) => !m.clusterId && (m.from === currentUser.id || m.to === currentUser.id),
    )
  }, [currentUser, state.messages])

  const threadWith = useCallback(
    (peerId: string) => {
      if (!currentUser) return [] as Message[]
      const me = currentUser.id
      return myMessages
        .filter((m) => (m.from === me && m.to === peerId) || (m.from === peerId && m.to === me))
        .sort((a, b) => a.createdAt - b.createdAt)
    },
    [currentUser, myMessages],
  )

  const threads = useMemo<Thread[]>(() => {
    if (!currentUser) return []
    const me = currentUser.id
    const byPeer = new Map<string, Thread>()
    // myMessages is unordered, so fold in time order and let the last write win
    for (const m of [...myMessages].sort((a, b) => a.createdAt - b.createdAt)) {
      const peerId = m.from === me ? m.to : m.from
      if (!peerId) continue
      const peer = state.users[peerId]
      if (!peer) continue
      const existing = byPeer.get(peerId)
      const unread =
        (existing?.unread ?? 0) + (m.to === me && !m.readAt ? 1 : 0)
      byPeer.set(peerId, { peer, last: m, unread })
    }
    return [...byPeer.values()].sort((a, b) => b.last.createdAt - a.last.createdAt)
  }, [currentUser, myMessages, state.users])

  const unreadCount = useMemo(() => threads.reduce((n, t) => n + t.unread, 0), [threads])

  /** Every cluster line the current planet can see, either direction. */
  const myClusterMessages = useMemo(() => {
    if (!currentUser) return [] as Message[]
    return Object.values(state.messages ?? {}).filter((m) => !!m.clusterId)
  }, [currentUser, state.messages])

  const clusterMessages = useCallback(
    (clusterId: string) =>
      myClusterMessages.filter((m) => m.clusterId === clusterId).sort((a, b) => a.createdAt - b.createdAt),
    [myClusterMessages],
  )

  const clusters = useMemo<ClusterThread[]>(() => {
    if (!currentUser) return []
    const me = currentUser.id
    const mine = Object.values(state.clusters ?? {}).filter((c) => c.members.includes(me))
    return mine
      .map((cluster) => {
        const lines = myClusterMessages
          .filter((m) => m.clusterId === cluster.id)
          .sort((a, b) => a.createdAt - b.createdAt)
        const last = lines[lines.length - 1] ?? null
        const unread = lines.filter((m) => m.from !== me && !m.readAt).length
        const members = cluster.members
          .map((id) => state.users[id])
          .filter((u): u is User => !!u)
        return { cluster, last, unread, members }
      })
      .sort((a, b) => (b.last?.createdAt ?? b.cluster.createdAt) - (a.last?.createdAt ?? a.cluster.createdAt))
  }, [currentUser, myClusterMessages, state.clusters, state.users])

  const clusterUnreadCount = useMemo(() => clusters.reduce((n, c) => n + c.unread, 0), [clusters])

  const searchPlanets = useCallback(async (term: string): Promise<User[]> => {
    try {
      return await backend.searchPlanets(term)
    } catch {
      // a failed lookup is not worth an error toast — the picker just stays empty
      return []
    }
  }, [])

  const createCluster = useCallback(
    async (name: string, memberIds: string[]): Promise<{ error: string | null; clusterId: string | null }> => {
      setBusy(true)
      try {
        const { state: next, clusterId } = await backend.createCluster(name, memberIds)
        if (mounted.current) {
          dispatch({ type: 'hydrate', state: next })
          setLastError(null)
        }
        sfx.launch()
        return { error: null, clusterId }
      } catch (e) {
        return { error: message(e), clusterId: null }
      } finally {
        if (mounted.current) setBusy(false)
      }
    },
    [],
  )

  const sendClusterMessage = useCallback(
    async (clusterId: string, text: string, image?: string): Promise<string | null> => {
      setBusy(true)
      try {
        const next = await backend.sendClusterMessage(clusterId, text, image)
        if (mounted.current) {
          dispatch({ type: 'hydrate', state: next })
          setLastError(null)
        }
        sfx.ping()
        return null
      } catch (e) {
        return message(e)
      } finally {
        if (mounted.current) setBusy(false)
      }
    },
    [],
  )

  const readCluster = useCallback((clusterId: string) => {
    void backend.readCluster(clusterId).catch(() => {
      // a failed read-receipt is cosmetic; the cluster is still on screen
    })
  }, [])

  const leaveCluster = useCallback(async (clusterId: string): Promise<string | null> => {
    setBusy(true)
    try {
      const next = await backend.leaveCluster(clusterId)
      if (mounted.current) {
        dispatch({ type: 'hydrate', state: next })
        setLastError(null)
      }
      return null
    } catch (e) {
      return message(e)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }, [])

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
    pendingConfirmation,
    clearPendingConfirmation,
    lastError,
    clearLastError,
    initialFocus,
    clearInitialFocus,
    login,
    signUp,
    resendConfirmation,
    loginAs,
    linkEmail,
    resetPassword,
    setPassword,
    changeEmail,
    changePassword,
    signOutEverywhere,
    deleteAccount,
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
    threads,
    threadWith,
    unreadCount,
    sendMessage,
    readThread,
    clusters,
    clusterMessages,
    clusterUnreadCount,
    searchPlanets,
    createCluster,
    sendClusterMessage,
    readCluster,
    leaveCluster,
    resetGalaxy,
  }

  return <GalaxyContext.Provider value={value}>{children}</GalaxyContext.Provider>
}

export function useGalaxy() {
  const ctx = useContext(GalaxyContext)
  if (!ctx) throw new Error('useGalaxy must be used inside <GalaxyProvider>')
  return ctx
}
