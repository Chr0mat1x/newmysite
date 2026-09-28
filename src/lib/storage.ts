import type { GalaxyState } from '../types'

const KEY = 'orbit.galaxy.v1'

/**
 * Bump whenever the demo seed's shape or tuning changes. Stored galaxies whose
 * version is older are discarded so tuning fixes actually reach returning users.
 */
export const SEED_VERSION = 3

export function loadState(): GalaxyState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GalaxyState
    if (!parsed || parsed.version !== 1 || !parsed.users || !parsed.posts) return null
    if (parsed.seedVersion !== SEED_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function saveState(state: GalaxyState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* quota — ignore, the galaxy stays in memory */
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
