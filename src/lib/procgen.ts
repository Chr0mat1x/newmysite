/** Deterministic procedural generation: every user gets a unique, reproducible planet. */

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type PlanetTexture = 'bands' | 'continents' | 'craters' | 'swirls' | 'ice'

export interface PlanetDesc {
  seed: number
  /** base surface luminance 0..100 — this is what distinguishes one planet from another */
  light: number
  texture: PlanetTexture
  rings: boolean
  ringTilt: number
  moons: number
  /** 0..1 how thick the atmosphere glow is */
  aura: number
}

/** Monochrome helper: `g(60, .4)` -> `hsla(0,0%,60%,.4)`. */
const g = (l: number, a = 1) => `hsla(0,0%,${l}%,${a})`

export function generatePlanet(seed: number): PlanetDesc {
  const rnd = mulberry32(seed)
  const textures: PlanetTexture[] = ['bands', 'continents', 'craters', 'swirls', 'ice']
  const roll = rnd()
  return {
    seed,
    // wide luminance spread so planets stay individually recognisable without colour:
    // near-black obsidian worlds at one end, bright bone-white at the other
    light: 16 + Math.floor(rnd() * 64),
    texture: textures[Math.floor(roll * textures.length)],
    rings: rnd() > 0.68,
    ringTilt: 0.16 + rnd() * 0.2,
    moons: rnd() > 0.82 ? 1 + Math.floor(rnd() * 2) : 0,
    aura: 0.35 + rnd() * 0.65,
  }
}

const cache = new Map<string, HTMLCanvasElement>()

/**
 * Renders a planet (surface + clouds + rings + atmosphere) into a cached canvas.
 * `size` is the planet diameter; the canvas adds padding for rings and glow.
 */
export function planetSprite(desc: PlanetDesc, size: number): HTMLCanvasElement {
  const pad = Math.max(10, size * 0.42)
  const dim = Math.ceil(size + pad * 2)
  const key = `${desc.seed}|${size}|${desc.texture}|${desc.rings}|${desc.aura.toFixed(2)}`
  const hit = cache.get(key)
  if (hit && hit.width === dim) return hit

  const cv = document.createElement('canvas')
  cv.width = dim
  cv.height = dim
  const ctx = cv.getContext('2d')!
  const c = dim / 2
  const R = size / 2
  const rnd = mulberry32(desc.seed ^ 0x9e3779b9)

  // --- atmosphere halo: a soft bone-white rim, no chroma -----------------
  const halo = ctx.createRadialGradient(c, c, R * 0.92, c, c, R + pad)
  halo.addColorStop(0, g(92, 0.42 * desc.aura))
  halo.addColorStop(0.35, g(70, 0.2 * desc.aura))
  halo.addColorStop(1, g(0, 0))
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(c, c, R + pad, 0, Math.PI * 2)
  ctx.fill()

  // --- rings (back half) -------------------------------------------------
  if (desc.rings) drawRings(ctx, c, c, R, desc, true)

  // --- sphere body -------------------------------------------------------
  const body = document.createElement('canvas')
  body.width = dim
  body.height = dim
  const bctx = body.getContext('2d')!
  bctx.save()
  bctx.beginPath()
  bctx.arc(c, c, R, 0, Math.PI * 2)
  bctx.clip()

  const base = bctx.createRadialGradient(c - R * 0.3, c - R * 0.35, R * 0.1, c, c, R * 1.15)
  base.addColorStop(0, g(Math.min(88, desc.light + 26)))
  base.addColorStop(0.6, g(desc.light))
  base.addColorStop(1, g(Math.max(4, desc.light - 28)))
  bctx.fillStyle = base
  bctx.fillRect(0, 0, dim, dim)

  drawSurface(bctx, dim, R, c, desc, rnd)
  bctx.restore()

  // spherical shading: light from upper-left
  bctx.save()
  bctx.beginPath()
  bctx.arc(c, c, R, 0, Math.PI * 2)
  bctx.clip()
  bctx.globalCompositeOperation = 'source-atop'
  const shade = bctx.createRadialGradient(c - R * 0.45, c - R * 0.5, R * 0.15, c, c, R * 1.25)
  shade.addColorStop(0, 'rgba(255,255,255,.22)')
  shade.addColorStop(0.42, 'rgba(255,255,255,0)')
  shade.addColorStop(1, 'rgba(0,0,0,.78)')
  bctx.fillStyle = shade
  bctx.fillRect(0, 0, dim, dim)

  // rim light
  bctx.globalCompositeOperation = 'source-atop'
  const rim = bctx.createRadialGradient(c, c, R * 0.55, c, c, R)
  rim.addColorStop(0, 'rgba(0,0,0,0)')
  rim.addColorStop(0.86, 'rgba(0,0,0,0)')
  rim.addColorStop(1, g(100, 0.55))
  bctx.fillStyle = rim
  bctx.fillRect(0, 0, dim, dim)
  bctx.restore()

  ctx.drawImage(body, 0, 0)

  // --- rings (front half) ------------------------------------------------
  if (desc.rings) drawRings(ctx, c, c, R, desc, false)

  cache.set(key, cv)
  if (cache.size > 400) cache.delete(cache.keys().next().value as string)
  return cv
}

function drawSurface(
  ctx: CanvasRenderingContext2D,
  dim: number,
  R: number,
  c: number,
  desc: PlanetDesc,
  rnd: () => number,
) {
  const light = Math.min(84, desc.light + 14)
  switch (desc.texture) {
    case 'bands': {
      const n = 5 + Math.floor(rnd() * 6)
      for (let i = 0; i < n; i++) {
        const y = c - R + (i / n) * R * 2 + rnd() * R * 0.12
        const h = R * (0.06 + rnd() * 0.16)
        ctx.fillStyle = g(Math.max(6, light - rnd() * 30), 0.2 + rnd() * 0.32)
        ctx.beginPath()
        for (let x = -20; x <= dim + 20; x += 8) {
          const yy = y + Math.sin((x / R) * 0.9 + i) * R * 0.06
          if (x === -20) ctx.moveTo(x, yy)
          else ctx.lineTo(x, yy)
        }
        ctx.lineTo(dim + 20, y + h)
        for (let x = dim + 20; x >= -20; x -= 8) {
          const yy = y + h + Math.sin((x / R) * 0.9 + i) * R * 0.06
          ctx.lineTo(x, yy)
        }
        ctx.closePath()
        ctx.fill()
      }
      break
    }
    case 'continents': {
      for (let i = 0; i < 16; i++) {
        const cx = c + (rnd() - 0.5) * R * 1.9
        const cy = c + (rnd() - 0.5) * R * 1.9
        const r = R * (0.1 + rnd() * 0.26)
        ctx.fillStyle = g(Math.max(8, desc.light - 22 - rnd() * 16), 0.55 + rnd() * 0.35)
        ctx.beginPath()
        const pts = 7 + Math.floor(rnd() * 5)
        for (let p = 0; p <= pts; p++) {
          const a = (p / pts) * Math.PI * 2
          const rr = r * (0.6 + rnd() * 0.7)
          const x = cx + Math.cos(a) * rr
          const y = cy + Math.sin(a) * rr
          if (p === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fill()
      }
      break
    }
    case 'craters': {
      for (let i = 0; i < 60; i++) {
        const a = rnd() * Math.PI * 2
        const d = Math.sqrt(rnd()) * R * 0.95
        const cx = c + Math.cos(a) * d
        const cy = c + Math.sin(a) * d
        const r = R * (0.03 + rnd() * 0.13)
        ctx.fillStyle = g(Math.max(4, desc.light - 26), 0.6)
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = g(Math.min(96, light + 14), 0.5)
        ctx.lineWidth = Math.max(1, R * 0.012)
        ctx.beginPath()
        ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 1.9)
        ctx.stroke()
      }
      break
    }
    case 'swirls': {
      ctx.lineWidth = Math.max(1, R * 0.03)
      for (let i = 0; i < 22; i++) {
        ctx.strokeStyle = g(Math.max(6, light - rnd() * 22), 0.12 + rnd() * 0.24)
        const cx = c + (rnd() - 0.5) * R * 1.2
        const cy = c + (rnd() - 0.5) * R * 1.2
        ctx.beginPath()
        for (let t = 0; t < Math.PI * 3; t += 0.15) {
          const rr = R * 0.05 + t * R * 0.05
          const x = cx + Math.cos(t + i) * rr
          const y = cy + Math.sin(t + i) * rr * 0.6
          if (t === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      break
    }
    case 'ice': {
      for (let i = 0; i < 9; i++) {
        const y = c + (rnd() - 0.5) * R * 1.6
        const w = R * (0.6 + rnd() * 0.9)
        ctx.fillStyle = g(Math.min(96, light + rnd() * 22), 0.2 + rnd() * 0.36)
        ctx.beginPath()
        ctx.ellipse(c + (rnd() - 0.5) * R, y, w, R * (0.08 + rnd() * 0.14), (rnd() - 0.5) * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
  }

  // fine grain
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2
    const d = Math.sqrt(rnd()) * R * 0.98
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)'
    ctx.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 1.2, 1.2)
  }
}

function drawRings(
  ctx: CanvasRenderingContext2D,
  c: number,
  cy: number,
  R: number,
  desc: PlanetDesc,
  back: boolean,
) {
  const rx = R * 1.85
  const ry = R * desc.ringTilt
  ctx.save()
  ctx.translate(c, cy)
  if (back) {
    // rear = upper half of the ring ellipse
    ctx.beginPath()
    ctx.rect(-rx * 1.2, -rx * 1.2, rx * 2.4, rx * 1.2 + ry)
    ctx.clip()
  } else {
    ctx.beginPath()
    ctx.rect(-rx * 1.2, ry * 0.1, rx * 2.4, rx * 1.4)
    ctx.clip()
  }
  const bands = 9
  for (let i = 0; i < bands; i++) {
    const t = i / bands
    const rr = R * (1.32 + t * 0.5)
    ctx.beginPath()
    ctx.ellipse(0, 0, rr, rr * desc.ringTilt, 0, 0, Math.PI * 2)
    ctx.lineWidth = R * (0.05 + 0.06 * Math.abs(Math.sin(i * 2.1)))
    ctx.strokeStyle = g(Math.min(96, 62 + 20 * Math.sin(i)), back ? 0.2 : 0.44)
    ctx.stroke()
  }
  ctx.restore()
}
