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

export const SUPERNOVA_THRESHOLD = 10
export const SUPERNOVA_TTL = 24 * 60 * 60 * 1000
