export interface User {
  id: string
  handle: string
  name: string
  bio: string
  seed: number
  createdAt: number
  mock?: boolean
  /** login identity — absent on seeded demo accounts */
  email?: string
  /** demo-grade salted hash, see lib/auth.ts. Not real security. */
  passwordHash?: string
  /** ids of users this planet is following — the "constellation" */
  following?: string[]
  /** ids of posts this planet has bookmarked — the "cargo hold" */
  saved?: string[]
}

export interface Signal {
  id: string
  authorId: string
  text: string
  createdAt: number
  /** orbit phase offset so each signal keeps its own lane */
  phase: number
}

export interface Post {
  id: string
  authorId: string
  text: string
  image?: string
  createdAt: number
  likes: string[]
  signals: Signal[]
  /** set the moment the post crosses the supernova threshold */
  supernovaAt?: number | null
  kind?: 'text' | 'image'
}

export interface GalaxyState {
  version: number
  /** demo-seed revision — lets us invalidate stale stored galaxies after tuning */
  seedVersion?: number
  users: Record<string, User>
  posts: Record<string, Post>
  currentUserId: string | null
  /**
   * Direct messages, keyed by id. Stored flat rather than nested inside a
   * conversation so a thread is just a filter — the same shape the `messages`
   * table has, and the same reason `stars` is a join table.
   */
  messages?: Record<string, Message>
}

/**
 * A private transmission between two planets. `from`/`to` are user ids; a thread
 * is identified by the unordered pair, so both sides read the same history
 * without a conversation row to keep in sync.
 */
export interface Message {
  id: string
  from: string
  to: string
  text: string
  createdAt: number
  /** set when the recipient has read it; undefined means unread */
  readAt?: number | null
}

// ---------------------------------------------------------------------------
// remote shapes — snake_case, exactly as Postgres returns them
// ---------------------------------------------------------------------------

export interface PlanetRow {
  id: string
  handle: string
  name: string
  bio: string
  seed: number
  following: string[] | null
  saved: string[] | null
  is_demo: boolean
  created_at: string
}

export interface SatelliteRow {
  id: string
  author: string
  body: string
  image: string | null
  kind: 'text' | 'image'
  supernova_at: string | null
  created_at: string
}

export interface SignalRow {
  id: string
  satellite: string
  author: string
  body: string
  phase: number
  created_at: string
}

export interface StarRow {
  satellite: string
  planet: string
}

export interface MessageRow {
  id: string
  sender: string
  recipient: string
  body: string
  created_at: string
  read_at: string | null
}

export const SUPERNOVA_THRESHOLD = 10
export const SUPERNOVA_TTL = 24 * 60 * 60 * 1000
