import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import type { GalaxyState, Post, Signal, User } from '../types'
import { SUPERNOVA_TTL, SUPERNOVA_THRESHOLD } from '../types'
import { loadState, saveState, uid } from '../lib/storage'
import { buildSeedGalaxy, makeUser } from '../lib/seed'
import { sfx } from '../lib/audio'
import { hashString } from '../lib/procgen'
import { hashPassword, handleFromIdentity, isValidEmail, isValidPassword, makeSalt, normalizeEmail, verifyPassword } from '../lib/auth'

type Action =
  | { type: 'hydrate'; state: GalaxyState }
  | { type: 'login'; user: User }
  | { type: 'logout' }
  | { type: 'updateUser'; patch: Partial<User> }
  | { type: 'linkEmail'; userId: string; email: string; passwordHash: string }
  | { type: 'addPost'; post: Post }
  | { type: 'deletePost'; id: string }
  | { type: 'toggleLike'; postId: string; userId: string }
  | { type: 'addSignal'; postId: string; signal: { id: string; authorId: string; text: string } }
  | { type: 'novaExpire' }
  | { type: 'toggleFollow'; userId: string }
  | { type: 'toggleSave'; postId: string }
  | { type: 'reset' }

function reducer(state: GalaxyState, action: Action): GalaxyState {
  switch (action.type) {
    case 'hydrate':
      return action.state
    case 'login':
      return {
        ...state,
        users: { ...state.users, [action.user.id]: action.user },
        currentUserId: action.user.id,
      }
    case 'logout':
      return { ...state, currentUserId: null }
    case 'updateUser': {
      if (!state.currentUserId) return state
      const cur = state.users[state.currentUserId]
      if (!cur) return state
      return { ...state, users: { ...state.users, [cur.id]: { ...cur, ...action.patch } } }
    }
    case 'linkEmail': {
      const u = state.users[action.userId]
      if (!u) return state
      return {
        ...state,
        users: { ...state.users, [action.userId]: { ...u, email: action.email, passwordHash: action.passwordHash } },
      }
    }
    case 'addPost':
      return { ...state, posts: { ...state.posts, [action.post.id]: action.post } }
    case 'deletePost': {
      const posts = { ...state.posts }
      delete posts[action.id]
      return { ...state, posts }
    }
    case 'toggleLike': {
      const post = state.posts[action.postId]
      if (!post) return state
      const liked = post.likes.includes(action.userId)
      const likes = liked
        ? post.likes.filter((l) => l !== action.userId)
        : [...post.likes, action.userId]
      const supernovaAt =
        likes.length >= SUPERNOVA_THRESHOLD
          ? post.supernovaAt ?? Date.now()
          : null
      return {
        ...state,
        posts: { ...state.posts, [action.postId]: { ...post, likes, supernovaAt } },
      }
    }
    case 'addSignal': {
      const post = state.posts[action.postId]
      if (!post) return state
      const signal = {
        ...action.signal,
        createdAt: Date.now(),
        phase: Math.random() * Math.PI * 2,
      }
      return {
        ...state,
        posts: { ...state.posts, [action.postId]: { ...post, signals: [...post.signals, signal] } },
      }
    }
    case 'novaExpire': {
      const now = Date.now()
      let changed = false
      const posts: Record<string, Post> = {}
      for (const [id, p] of Object.entries(state.posts)) {
        if (p.supernovaAt && now - p.supernovaAt > SUPERNOVA_TTL) {
          posts[id] = { ...p, supernovaAt: null }
          changed = true
        } else posts[id] = p
      }
      return changed ? { ...state, posts } : state
    }
    case 'toggleFollow': {
      const me = state.currentUserId ? state.users[state.currentUserId] : null
      if (!me || action.userId === me.id) return state
      const following = me.following ?? []
      const has = following.includes(action.userId)
      return {
        ...state,
        users: {
          ...state.users,
          [me.id]: {
            ...me,
            following: has ? following.filter((f) => f !== action.userId) : [...following, action.userId],
          },
        },
      }
    }
    case 'toggleSave': {
      const me = state.currentUserId ? state.users[state.currentUserId] : null
      if (!me) return state
      const saved = me.saved ?? []
      const has = saved.includes(action.postId)
      return {
        ...state,
        users: {
          ...state.users,
          [me.id]: {
            ...me,
            saved: has ? saved.filter((s) => s !== action.postId) : [...saved, action.postId],
          },
        },
      }
    }
    default:
      return state
  }
}

interface Ctx {
  state: GalaxyState
  currentUser: User | null
  users: User[]
  postsOf: (userId: string) => Post[]
  postById: (id: string) => Post | undefined
  userById: (id: string) => User | undefined
  supernovas: Post[]
  /** Sign in with email + password. Returns an error message, or null on success. */
  login: (email: string, password: string) => string | null
  /** Create a new planet. Returns an error message, or null on success. */
  signUp: (email: string, password: string, name: string, planetVariant?: number) => string | null
  /** Enter as an existing planet without credentials (seeded demo accounts). */
  loginAs: (userId: string) => void
  /** Attach an email + password to the current local account. */
  linkEmail: (email: string, password: string) => string | null
  logout: () => void
  updateProfile: (patch: Partial<User>) => void
  createPost: (text: string, image?: string) => Post | null
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

function initial(): GalaxyState {
  return loadState() ?? buildSeedGalaxy()
}

export function GalaxyProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial)

  useEffect(() => {
    saveState(state)
  }, [state])

  // supernova decay — check every minute
  useEffect(() => {
    const t = setInterval(() => dispatch({ type: 'novaExpire' }), 60000)
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

  const login = useCallback(
    (email: string, password: string): string | null => {
      const mail = normalizeEmail(email)
      if (!isValidEmail(mail)) return 'enter a valid email address'
      const user = Object.values(state.users).find((u) => !u.mock && u.email === mail)
      if (!user || !user.passwordHash) return 'no planet orbits this email yet'
      const salt = user.id
      if (!verifyPassword(password, salt, user.passwordHash)) return 'wrong password — try again'
      dispatch({ type: 'login', user })
      sfx.launch()
      return null
    },
    [state.users],
  )

  const signUp = useCallback(
    (email: string, password: string, name: string, planetVariant = 0): string | null => {
      const mail = normalizeEmail(email)
      if (!isValidEmail(mail)) return 'enter a valid email address'
      if (!isValidPassword(password)) return `password needs at least ${8} characters`
      if (Object.values(state.users).some((u) => !u.mock && u.email === mail)) {
        return 'this email already has a planet — sign in instead'
      }
      const label = name.trim() || mail.split('@')[0]
      const taken = new Set(Object.values(state.users).map((u) => u.handle.toLowerCase()))
      const handle = handleFromIdentity(label, mail, taken)
      const base = makeUser(handle, label, planetVariant)
      // the salt is the account id, so the hash is derived from the final user
      const user: User = { ...base, email: mail, passwordHash: hashPassword(password, base.id) }
      dispatch({ type: 'login', user })
      sfx.launch()
      return null
    },
    [state.users],
  )

  const loginAs = useCallback(
    (userId: string) => {
      const user = state.users[userId]
      if (!user) return
      dispatch({ type: 'login', user })
      sfx.launch()
    },
    [state.users],
  )

  const linkEmail = useCallback(
    (email: string, password: string): string | null => {
      const id = state.currentUserId
      if (!id) return 'you are not signed in'
      const mail = normalizeEmail(email)
      if (!isValidEmail(mail)) return 'enter a valid email address'
      if (!isValidPassword(password)) return `password needs at least ${8} characters`
      if (Object.values(state.users).some((u) => u.id !== id && !u.mock && u.email === mail)) {
        return 'another planet already uses this email'
      }
      dispatch({ type: 'linkEmail', userId: id, email: mail, passwordHash: hashPassword(password, id) })
      return null
    },
    [state.currentUserId, state.users],
  )

  const logout = useCallback(() => {
    sfx.click()
    dispatch({ type: 'logout' })
  }, [])

  const updateProfile = useCallback((patch: Partial<User>) => dispatch({ type: 'updateUser', patch }), [])

  const createPost = useCallback(
    (text: string, image?: string) => {
      if (!state.currentUserId) return null
      const body = text.trim()
      if (!body && !image) return null
      const post: Post = {
        id: uid(),
        authorId: state.currentUserId,
        text: body,
        image: image?.trim() || undefined,
        createdAt: Date.now(),
        likes: [],
        signals: [],
        supernovaAt: null,
        kind: image ? 'image' : 'text',
      }
      dispatch({ type: 'addPost', post })
      sfx.launch()
      return post
    },
    [state.currentUserId],
  )

  const deletePost = useCallback((id: string) => {
    sfx.click()
    dispatch({ type: 'deletePost', id })
  }, [])

  const toggleLike = useCallback(
    (postId: string) => {
      if (!state.currentUserId) return
      const post = state.posts[postId]
      const already = post?.likes.includes(state.currentUserId)
      const willNova = !already && post && post.likes.length + 1 >= SUPERNOVA_THRESHOLD && !post.supernovaAt
      if (willNova) sfx.supernova()
      else if (already) sfx.click()
      else sfx.like()
      dispatch({ type: 'toggleLike', postId, userId: state.currentUserId })
    },
    [state.currentUserId, state.posts],
  )

  const addSignal = useCallback(
    (postId: string, text: string) => {
      if (!state.currentUserId || !text.trim()) return
      dispatch({ type: 'addSignal', postId, signal: { id: uid(), authorId: state.currentUserId, text: text.trim() } })
      sfx.signal()
    },
    [state.currentUserId],
  )

  const resetGalaxy = useCallback(() => {
    const fresh = buildSeedGalaxy()
    dispatch({ type: 'hydrate', state: fresh })
  }, [])

  const toggleFollow = useCallback(
    (userId: string) => {
      if (!state.currentUserId) return
      if (state.users[state.currentUserId]?.following?.includes(userId)) sfx.click()
      else sfx.signal()
      dispatch({ type: 'toggleFollow', userId })
    },
    [state.currentUserId, state.users],
  )

  const toggleSave = useCallback(
    (postId: string) => {
      if (!state.currentUserId) return
      sfx.click()
      dispatch({ type: 'toggleSave', postId })
    },
    [state.currentUserId],
  )

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
    login,
    signUp,
    loginAs,
    linkEmail,
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
