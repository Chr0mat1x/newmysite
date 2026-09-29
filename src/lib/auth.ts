/**
 * Demo-grade local credentials. This runs entirely in the browser and exists so
 * the MVP has a real sign-up/sign-in flow without a backend — it is NOT secure
 * storage. A production build must move this behind a server.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const PASSWORD_MIN = 8

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email))
}

export function isValidPassword(pw: string): boolean {
  return pw.length >= PASSWORD_MIN
}

/** Turns "Nova Ashkar" / "nova@example.com" into a valid @handle. */
export function handleFromIdentity(name: string, email: string, taken: Set<string> = new Set()): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '')
      .slice(0, 20) ||
    normalizeEmail(email).split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 20) ||
    'traveler'

  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}${Date.now().toString(36).slice(-4)}`
}

/**
 * FNV-1a over `${salt}:${password}`, repeated to slow down trivial guessing.
 * Deterministic so the same password re-hashes to the same digest.
 */
export function hashPassword(password: string, salt: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  const input = `${salt}:${password}`
  for (let round = 0; round < 5000; round++) {
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i) + round
      h1 ^= c
      h1 = Math.imul(h1, 0x01000193) >>> 0
      h2 = (Math.imul(h2 ^ c, 0x85ebca6b) >>> 0) + i
    }
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

export function makeSalt(): string {
  const bytes = new Uint8Array(12)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function verifyPassword(password: string, salt: string, expected: string): boolean {
  return hashPassword(password, salt) === expected
}
