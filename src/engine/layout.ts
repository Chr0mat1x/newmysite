import type { User } from '../types'
import { mulberry32 } from '../lib/procgen'
import { hashString } from '../lib/procgen'

export interface PlanetLayout {
  id: string
  x: number
  y: number
  radius: number
  activity: number
}

/** Distance per sqrt(planet) — keeps visual density constant as the galaxy grows. */
const SPACING_PER = 240

/** Golden-angle spiral + jitter: even, organic spread that never overlaps badly. */
export function layoutGalaxy(
  users: User[],
  scoreOf: (userId: string) => { posts: number; likes: number; signals: number },
): PlanetLayout[] {
  const n = Math.max(1, users.length)
  const worldRadius = SPACING_PER * Math.sqrt(n)
  return users.map((u, i) => {
    const s = scoreOf(u.id)
    const activity = s.likes * 0.34 + s.signals * 0.62 + s.posts * 1.2
    const radius = 26 + Math.min(230, activity) * 0.4

    const rnd = mulberry32(hashString(u.id))
    const golden = 2.399963229728653
    const t = i / n
    // sqrt keeps density uniform across the disk
    const dist = Math.sqrt(t) * (worldRadius - 200) + 110 * rnd()
    const ang = i * golden + rnd() * 0.55
    return {
      id: u.id,
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist * 0.92,
      radius: radius * (0.85 + rnd() * 0.3),
      activity,
    }
  })
}
