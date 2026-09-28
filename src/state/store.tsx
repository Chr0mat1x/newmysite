import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import type { GalaxyState, Post, User } from '../types'
import { SUPERNOVA_TTL, SUPERNOVA_THRESHOLD } from '../types'
import { loadState, saveState, uid } from '../lib/storage'
import { buildSeedGalaxy, makeUser } from '../lib/seed'
import { sfx } from '../lib/audio'
import { hashString } from '../lib/procgen'

type Action =
  | { type: 'hydrate'; state: GalaxyState }
  | { type: 'login'; user: User }
  | { type: 'logout' }
  | { type: 'updateUser'; patch: Partial<User> }
  | { type: 'addPost'; post: Post }
  | { type: 'deletePost'; id: string }
  | { type: 'toggleLike'; postId: string; userId: string }
  | { type: 'addSignal'; postId: string; signal: { id: string; authorId: string; text: string } }
  | { type: 'novaExpire' }
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
  login: (handle: string, name: string, planetVariant?: number) => User
  logout: () => void
  updateProfile: (patch: Partial<User>) => void
  createPost: (text: string, image?: string) => Post | null
  deletePost: (id: string) => void
  toggleLike: (postId: string) => void
  addSignal: (postId: string, text: string) => void
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
    (handle: string, name: string, planetVariant = 0) => {
      const existing = Object.values(state.users).find(
        (u) => u.handle.toLowerCase() === handle.trim().toLowerCase().replace(/[^a-z0-9_]/gi, ''),
      )
      const user = existing ?? makeUser(handle, name, planetVariant)
      dispatch({ type: 'login', user })
      sfx.launch()
      return user
    },
    [state.users],
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

  const currentUser = state.currentUserId ? state.users[state.currentUserId] ?? null : null

  const value: Ctx = {
    state,
    currentUser,
    users,
    postsOf,
    postById,
    userById,
    supernovas,
    login,
    logout,
    updateProfile,
    createPost,
    deletePost,
    toggleLike,
    addSignal,
    resetGalaxy,
  }

  return <GalaxyContext.Provider value={value}>{children}</GalaxyContext.Provider>
}

export function useGalaxy() {
  const ctx = useContext(GalaxyContext)
  if (!ctx) throw new Error('useGalaxy must be used inside <GalaxyProvider>')
  return ctx
}
