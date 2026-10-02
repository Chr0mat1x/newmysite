import type { GalaxyState, Message, Post, User } from '../types'
import { SUPERNOVA_THRESHOLD, SUPERNOVA_TTL } from '../types'

export type Action =
  | { type: 'hydrate'; state: GalaxyState }
  | { type: 'login'; user: User }
  | { type: 'logout' }
  | { type: 'updateUser'; patch: Partial<User> }
  | { type: 'linkEmail'; userId: string; email: string; passwordHash: string }
  | { type: 'deleteUser'; id: string }
  | { type: 'addPost'; post: Post }
  | { type: 'deletePost'; id: string }
  | { type: 'toggleLike'; postId: string; userId: string }
  | { type: 'addSignal'; postId: string; signal: { id: string; authorId: string; text: string } }
  | { type: 'novaExpire' }
  | { type: 'toggleFollow'; userId: string }
  | { type: 'toggleSave'; postId: string }
  | { type: 'addMessage'; message: Message }
  | { type: 'readThread'; userId: string; peerId: string }

/**
 * Pure state transitions, shared by the local (offline) backend and by the
 * optimistic updates the store applies while a remote write is in flight.
 */
export function reducer(state: GalaxyState, action: Action): GalaxyState {
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
    case 'deleteUser': {
      const posts = { ...state.posts }
      // the planet's satellites go with it, and any signal or star they left
      // elsewhere goes too — a deleted world must not linger in other orbits
      for (const [id, p] of Object.entries(posts)) {
        if (p.authorId === action.id) {
          delete posts[id]
          continue
        }
        const signals = p.signals.filter((s) => s.authorId !== action.id)
        const likes = p.likes.filter((l) => l !== action.id)
        if (signals.length !== p.signals.length || likes.length !== p.likes.length) {
          posts[id] = { ...p, signals, likes }
        }
      }
      const users: Record<string, User> = {}
      for (const [id, u] of Object.entries(state.users)) {
        if (id === action.id) continue
        users[id] = {
          ...u,
          following: (u.following ?? []).filter((f) => f !== action.id),
        }
      }
      // the planet's private threads go with it — a deleted world must not leave
      // readable mail behind in somebody else's inbox
      const messages: Record<string, Message> = {}
      for (const [id, m] of Object.entries(state.messages ?? {})) {
        if (m.from !== action.id && m.to !== action.id) messages[id] = m
      }
      return {
        ...state,
        users,
        posts,
        messages,
        currentUserId: state.currentUserId === action.id ? null : state.currentUserId,
      }
    }
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
      const supernovaAt = likes.length >= SUPERNOVA_THRESHOLD ? post.supernovaAt ?? Date.now() : null
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
    case 'addMessage':
      return { ...state, messages: { ...(state.messages ?? {}), [action.message.id]: action.message } }
    case 'readThread': {
      // mark every message the peer sent me as read; anything I sent stays as-is
      const messages = state.messages ?? {}
      let changed = false
      const next: Record<string, Message> = {}
      for (const [id, m] of Object.entries(messages)) {
        if (m.from === action.peerId && m.to === action.userId && !m.readAt) {
          next[id] = { ...m, readAt: Date.now() }
          changed = true
        } else next[id] = m
      }
      return changed ? { ...state, messages: next } : state
    }
    default:
      return state
  }
}
