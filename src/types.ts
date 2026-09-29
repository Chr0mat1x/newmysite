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

export const SUPERNOVA_THRESHOLD = 10
export const SUPERNOVA_TTL = 24 * 60 * 60 * 1000
