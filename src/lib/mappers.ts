import type { GalaxyState, Message, MessageRow, PlanetRow, Post, SatelliteRow, Signal, SignalRow } from '../types'

/** Postgres rows <-> the camelCase shapes the React tree already consumes. */

const ts = (iso: string | null): number => (iso ? Date.parse(iso) : 0)

export function toUser(row: PlanetRow): {
  id: string
  handle: string
  name: string
  bio: string
  seed: number
  createdAt: number
  mock: boolean
  following: string[]
  saved: string[]
} {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    bio: row.bio,
    seed: Number(row.seed),
    createdAt: ts(row.created_at) || Date.now(),
    // demo planets stay flagged so the UI can mark them read-only
    mock: row.is_demo,
    following: row.following ?? [],
    saved: row.saved ?? [],
  }
}

export function toSignal(row: SignalRow): Signal {
  return {
    id: row.id,
    authorId: row.author,
    text: row.body,
    createdAt: ts(row.created_at),
    phase: row.phase,
  }
}

export function toPost(row: SatelliteRow, signals: Signal[], likes: string[]): Post {
  return {
    id: row.id,
    authorId: row.author,
    text: row.body,
    image: row.image ?? undefined,
    createdAt: ts(row.created_at) || Date.now(),
    likes,
    signals,
    supernovaAt: row.supernova_at ? ts(row.supernova_at) : null,
    kind: row.kind,
  }
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    from: row.sender,
    to: row.recipient,
    text: row.body,
    createdAt: ts(row.created_at) || Date.now(),
    readAt: row.read_at ? ts(row.read_at) : null,
  }
}

/**
 * Folds the four remote tables into the single `GalaxyState` the app has always
 * used, so every component downstream keeps working unchanged.
 */
export function buildState(
  planets: PlanetRow[],
  satellites: SatelliteRow[],
  signals: SignalRow[],
  stars: { satellite: string; planet: string }[],
  currentUserId: string | null,
  messages: MessageRow[] = [],
): GalaxyState {
  const users: GalaxyState['users'] = {}
  for (const p of planets) users[p.id] = toUser(p)

  const signalsByPost = new Map<string, Signal[]>()
  for (const s of signals) {
    const list = signalsByPost.get(s.satellite) ?? []
    list.push(toSignal(s))
    signalsByPost.set(s.satellite, list)
  }

  const likesByPost = new Map<string, string[]>()
  for (const star of stars) {
    const list = likesByPost.get(star.satellite) ?? []
    list.push(star.planet)
    likesByPost.set(star.satellite, list)
  }

  const posts: GalaxyState['posts'] = {}
  for (const s of satellites) {
    posts[s.id] = toPost(s, signalsByPost.get(s.id) ?? [], likesByPost.get(s.id) ?? [])
  }

  const msgs: Record<string, Message> = {}
  for (const m of messages) msgs[m.id] = toMessage(m)

  return { version: 1, users, posts, currentUserId, messages: msgs }
}
