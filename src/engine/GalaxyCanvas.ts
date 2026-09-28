/**
 * GalaxyCanvas — the core renderer for ORBIT.
 *
 * Everything happens in one 2D canvas: parallax starfield, procedurally
 * generated planets, orbiting post-satellites, supernovae, plasma links and
 * the burst FX that fires when a post goes supernova. Layout is computed in
 * world space and the camera is a plain (x, y, zoom) tripod so flight between
 * planets is just an animated camera lerp.
 */
import type { PlanetLayout } from './layout'
import type { Post, User } from '../types'
import { planetSprite, generatePlanet, mulberry32, hashString, type PlanetDesc } from '../lib/procgen'
import { TAU, clamp, easeInOutCubic, lerp } from '../lib/math'
import { Starfield } from './Starfield'

interface Satellite {
  angle: number
  speed: number
  dist: number
  post: Post
  size: number
}

interface PlanetNode {
  layout: PlanetLayout
  user: User
  desc: PlanetDesc
  satellites: Satellite[]
  hasNova: boolean
  novaPosts: Post[]
  /** pop-in animation progress on first appearance */
  appear: number
  pulse: number
}

interface Burst {
  x: number
  y: number
  t: number
  hue: number
  seed: number
}

export interface RenderStats {
  fps: number
  visible: number
  total: number
}

export class GalaxyEngine {
  private ctx: CanvasRenderingContext2D
  private starfield = new Starfield(918273)
  private nodes: PlanetNode[] = []
  private bursts: Burst[] = []
  private w = 0
  private h = 0
  private dpr = 1

  cam = { x: 0, y: 0, zoom: 1 }
  target = { x: 0, y: 0, zoom: 1 }
  flight: { from: { x: number; y: number; zoom: number }; to: { x: number; y: number; zoom: number }; t: number; dur: number } | null =
    null

  hovered: string | null = null
  selected: string | null = null
  showLabels = true
  warp = 0

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('2D canvas unavailable')
    this.ctx = ctx
  }

  resize(w: number, h: number, dpr = 1) {
    this.w = w
    this.h = h
    this.dpr = dpr
    this.starfield.resize(w, h)
  }

  setData(layouts: PlanetLayout[], users: Map<string, User>, byAuthor: Map<string, Post[]>) {
    const prev = new Map(this.nodes.map((n) => [n.user.id, n]))
    this.nodes = layouts.map((layout) => {
      const user = users.get(layout.id)!
      const old = prev.get(layout.id)
      const posts = byAuthor.get(layout.id) ?? []
      const novaPosts = posts.filter(
        (p) => p.supernovaAt && Date.now() - p.supernovaAt < 24 * 3600 * 1000,
      )
      const visible = posts
        .slice()
        .sort((a, b) => b.likes.length + b.signals.length * 2 - (a.likes.length + a.signals.length * 2))
        .slice(0, 14)

      const rnd = mulberry32(hashString(layout.id) ^ 0x51ed)
      const prevAngles = new Map<string, number>()
      for (const s of old?.satellites ?? []) prevAngles.set(s.post.id, s.angle)
      const satellites: Satellite[] = visible.map((post, i) => {
        const weight = post.likes.length * 0.6 + post.signals.length * 1.1 + (post.supernovaAt ? 6 : 0)
        const ring = 1 + Math.floor(i / 3)
        const dir = i % 2 === 0 ? 1 : -1
        // always consume the RNG so layout stays deterministic frame to frame
        const jitter = rnd() * 0.06
        const seedAngle = rnd() * TAU
        return {
          // keep the current orbital phase so likes never teleport a satellite
          angle: prevAngles.get(post.id) ?? seedAngle,
          // brighter posts orbit slower & further out; keeps motion readable
          speed: dir * (0.16 + 0.5 / (1 + weight * 0.35)) / (1 + ring * 0.3),
          dist: 1.0 + ring * 0.42 + (jitter - 0.03),
          post,
          size: 2.2 + Math.min(3.4, weight * 0.22),
        }
      })

      const desc = old?.desc ?? generatePlanet(user.seed, user.hue)
      desc.hue = user.hue
      return {
        layout,
        user,
        desc,
        satellites,
        hasNova: novaPosts.length > 0,
        novaPosts,
        appear: old ? 1 : 0,
        pulse: 0,
      }
    })
  }

  /** Instantly anchor the camera (used on first load and after login). */
  snap(x: number, y: number, zoom: number) {
    this.cam = { x, y, zoom }
    this.target = { x, y, zoom }
    this.flight = null
  }

  /** Cinematic flight — the signature interaction. */
  flyTo(x: number, y: number, zoom: number, dur = 1500) {
    this.flight = {
      from: { ...this.cam },
      to: { x, y, zoom },
      t: 0,
      dur,
    }
    this.target = { x, y, zoom }
  }

  /** Smooth pan without warp (mouse drag / free flight). */
  panTo(x: number, y: number, zoom?: number) {
    this.target = { x, y, zoom: zoom ?? this.target.zoom }
    this.flight = null
  }

  spawnBurst(x: number, y: number, hue: number) {
    this.bursts.push({ x, y, t: 0, hue, seed: Math.random() * 1000 })
    // screen shake for impact
    this.pulseShake()
  }

  private shake = 0
  private pulseShake() {
    this.shake = 1
  }

  worldToScreen(x: number, y: number) {
    return {
      x: (x - this.cam.x) * this.cam.zoom + this.w / 2,
      y: (y - this.cam.y) * this.cam.zoom + this.h / 2,
    }
  }

  planetAt(sx: number, sy: number): string | null {
    // nearest planet whose screen disc contains the point (plus a touch of slack)
    let best: { id: string; d: number } | null = null
    for (const n of this.nodes) {
      const p = this.worldToScreen(n.layout.x, n.layout.y)
      const r = Math.max(16, n.layout.radius * this.cam.zoom)
      const d = Math.hypot(p.x - sx, p.y - sy)
      if (d <= r + 8) {
        if (!best || d < best.d) best = { id: n.user.id, d }
      }
    }
    return best?.id ?? null
  }

  getNode(id: string) {
    return this.nodes.find((n) => n.user.id === id) ?? null
  }

  select(id: string | null) {
    this.selected = id
  }

  update(dt: number, time: number) {
    // camera easing
    if (this.flight) {
      this.flight.t += dt * 1000
      const k = clamp(this.flight.t / this.flight.dur, 0, 1)
      const e = easeInOutCubic(k)
      this.cam.x = lerp(this.flight.from.x, this.flight.to.x, e)
      this.cam.y = lerp(this.flight.from.y, this.flight.to.y, e)
      this.cam.zoom = lerp(this.flight.from.zoom, this.flight.to.zoom, e)
      // warp peaks in the middle of the journey
      this.warp = Math.sin(k * Math.PI) * 1
      if (k >= 1) this.flight = null
    } else {
      const s = 1 - Math.pow(0.0016, dt)
      this.cam.x = lerp(this.cam.x, this.target.x, s)
      this.cam.y = lerp(this.cam.y, this.target.y, s)
      this.cam.zoom = lerp(this.cam.zoom, this.target.zoom, s)
      this.warp = lerp(this.warp, 0, 1 - Math.pow(0.0001, dt))
    }

    this.shake = lerp(this.shake, 0, 1 - Math.pow(0.002, dt))

    for (const n of this.nodes) {
      if (n.appear < 1) n.appear = clamp(n.appear + dt * 1.6, 0, 1)
      n.pulse = Math.max(0, n.pulse - dt)
      for (const s of n.satellites) s.angle += s.speed * dt
    }

    for (const b of this.bursts) b.t += dt
    this.bursts = this.bursts.filter((b) => b.t < 1.8)
  }

  render(time: number) {
    const ctx = this.ctx
    const { w, h } = this
    const zoom = this.cam.zoom

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    // camera shake
    const sh = this.shake * this.shake * 9
    const shakeX = sh ? (Math.random() - 0.5) * sh : 0
    const shakeY = sh ? (Math.random() - 0.5) * sh : 0

    ctx.save()
    ctx.translate(shakeX, shakeY)

    // --- background -------------------------------------------------------
    this.starfield.resize(w, h)
    this.starfield.draw(ctx, this.cam.x, this.cam.y, time)

    if (this.warp > 0.02) this.drawWarp()

    // --- world space ------------------------------------------------------
    ctx.translate(w / 2, h / 2)
    ctx.scale(zoom, zoom)
    ctx.translate(-this.cam.x, -this.cam.y)

    const margin = 340 / zoom
    let visible = 0

    // plasma links between the planets of the galaxy (faint constellation web)
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    for (const n of this.nodes) {
      if (!n.hasNova) continue
      for (const other of this.nodes) {
        if (other.user.id === n.user.id) continue
        if (!other.hasNova && other.layout.activity < 40) continue
        const d = Math.hypot(n.layout.x - other.layout.x, n.layout.y - other.layout.y)
        if (d > 900) continue
        ctx.strokeStyle = `hsla(${n.desc.hue},90%,70%,${0.05 * (1 - d / 900)})`
        ctx.lineWidth = 0.8 / this.cam.zoom
        ctx.beginPath()
        ctx.moveTo(n.layout.x, n.layout.y)
        ctx.lineTo(other.layout.x, other.layout.y)
        ctx.stroke()
      }
    }
    ctx.restore()

    // orbit rings behind planets
    for (const n of this.nodes) {
      if (!this.inView(n, margin)) continue
      this.drawOrbitRing(n, time, true)
    }

    // sort so nearer (bigger) planets draw last
    const sorted = this.nodes
      .filter((n) => this.inView(n, margin))
      .sort((a, b) => a.layout.radius - b.layout.radius)
    visible = sorted.length

    for (const n of sorted) this.drawPlanet(n, time)
    for (const n of sorted) this.drawOrbitRing(n, time, false)
    for (const n of sorted) this.drawSatellites(n, time)

    // bursts (supernova FX) live in world space
    for (const b of this.bursts) this.drawBurst(b)

    ctx.restore()

    return { visible, total: this.nodes.length }
  }

  private inView(n: PlanetNode, margin: number) {
    const sx = n.layout.x - this.cam.x
    const sy = n.layout.y - this.cam.y
    const half = { w: this.w / 2 / this.cam.zoom + margin, h: this.h / 2 / this.cam.zoom + margin }
    const extent = n.layout.radius * (n.desc.rings ? 2.6 : 1.4) + 90
    return Math.abs(sx) < half.w + extent && Math.abs(sy) < half.h + extent
  }

  private drawOrbitRing(n: PlanetNode, _time: number, behind: boolean) {
    if (n.satellites.length === 0) return
    const ctx = this.ctx
    const R = n.layout.radius
    const maxRing = n.satellites.reduce((m, s) => Math.max(m, s.dist), 1) + 0.5
    if (behind) return // lanes are drawn in full once, in front of the planet
    // drawn after the planet: thin glowing lane lines, tilted for a 3D feel
    ctx.save()
    ctx.translate(n.layout.x, n.layout.y)
    ctx.globalCompositeOperation = 'screen'
    const tilt = 0.34
    const rings = Math.max(1, Math.ceil((maxRing - 0.5) / 1.42))
    for (let r = 0; r < rings; r++) {
      const rr = R * (1.0 + (r + 1) * 0.42)
      ctx.beginPath()
      ctx.ellipse(0, 0, rr, rr * tilt, 0, 0, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(0, 0, rr, rr * tilt, 0, 0, TAU)
      ctx.lineWidth = clamp(1.1 * (this.cam.zoom > 1.4 ? 1 : 0.8), 0.5, 2.4)
      const a = (n.hasNova ? 0.3 : 0.16) * clamp(this.cam.zoom, 0.4, 1.6)
      ctx.strokeStyle = `hsla(${n.desc.hue2},95%,72%,${a})`
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawSatellites(n: PlanetNode, time: number) {
    const ctx = this.ctx
    const R = n.layout.radius
    const tilt = 0.34
    const scale = clamp(this.cam.zoom, 0.35, 1.8)
    const lod = R * this.cam.zoom < 26
    ctx.save()
    for (const s of n.satellites) {
      const a = s.angle
      const rr = R * s.dist
      const x = n.layout.x + Math.cos(a) * rr
      const y = n.layout.y + Math.sin(a) * rr * tilt
      const nova = !!s.post.supernovaAt && Date.now() - (s.post.supernovaAt ?? 0) < 24 * 3600 * 1000
      if (lod) {
        ctx.fillStyle = nova ? 'rgba(255,180,255,.9)' : `hsla(${n.desc.hue2},90%,80%,.6)`
        ctx.fillRect(x - 1, y - 1, 2, 2)
        continue
      }
      const size = s.size * scale
      // glow
      const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 3.4)
      if (nova) {
        glow.addColorStop(0, 'rgba(255,230,255,.95)')
        glow.addColorStop(0.4, 'rgba(255,107,214,.5)')
        glow.addColorStop(1, 'rgba(255,107,214,0)')
      } else {
        glow.addColorStop(0, `hsla(${n.desc.hue2},100%,82%,.85)`)
        glow.addColorStop(1, `hsla(${n.desc.hue},100%,60%,0)`)
      }
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, size * 3.4, 0, TAU)
      ctx.fill()

      ctx.fillStyle = nova ? '#fff2ff' : '#ffffff'
      ctx.beginPath()
      ctx.arc(x, y, size, 0, TAU)
      ctx.fill()

      // image satellites get a tiny preview chip
      if (s.post.image && this.cam.zoom > 1.15) {
        this.drawSatChip(x, y, s, n.desc.hue2)
      }
    }
    ctx.restore()
  }

  private chipCache = new Map<string, HTMLImageElement>()
  private drawSatChip(x: number, y: number, s: Satellite, hue: number) {
    const ctx = this.ctx
    const size = 26
    const key = s.post.image!
    let img = this.chipCache.get(key)
    if (!img) {
      img = new Image()
      img.crossOrigin = 'anonymous'
      img.referrerPolicy = 'no-referrer'
      img.src = key
      this.chipCache.set(key, img)
    }
    if (!img.complete || img.naturalWidth === 0) return
    const r = size / 2
    const hx = x - r
    const hy = y - r
    ctx.save()
    ctx.beginPath()
    const rr = 5
    ctx.moveTo(hx + rr, hy)
    ctx.arcTo(hx + size, hy, hx + size, hy + size, rr)
    ctx.arcTo(hx + size, hy + size, hx, hy + size, rr)
    ctx.arcTo(hx, hy + size, hx, hy, rr)
    ctx.arcTo(hx, hy, hx + size, hy, rr)
    ctx.closePath()
    ctx.save()
    ctx.clip()
    ctx.drawImage(img, hx, hy, size, size)
    ctx.restore()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = s.post.supernovaAt ? 'rgba(255,150,235,.95)' : `hsla(${hue},95%,78%,.75)`
    ctx.stroke()
    ctx.restore()
  }

  private drawPlanet(n: PlanetNode, time: number) {
    const ctx = this.ctx
    const { x, y, radius } = n.layout
    const scr = radius * this.cam.zoom
    const appear = 1 - Math.pow(1 - n.appear, 3)
    const scale = 0.4 + appear * 0.6

    const isHover = this.hovered === n.user.id
    const isSel = this.selected === n.user.id
    const boost = (isHover ? 1.06 : 1) * (isSel ? 1.05 : 1) * scale

    if (scr < 5) {
      // LOD: distant planets become pure light
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      const g = ctx.createRadialGradient(x, y, 0, x, y, 22 / this.cam.zoom + radius)
      g.addColorStop(0, `hsla(${n.desc.hue},95%,80%,.95)`)
      g.addColorStop(1, `hsla(${n.desc.hue2},95%,60%,0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, 22 / this.cam.zoom + radius, 0, TAU)
      ctx.fill()
      ctx.restore()
      return
    }

    const size = radius * 2 * boost
    const sprite = planetSprite(n.desc, Math.round(clamp(radius * 2 * boost, 8, 520)))
    ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2, sprite.width, sprite.height)

    // supernova owner: blazing corona
    if (n.hasNova) {
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      const pulse = 0.7 + 0.3 * Math.sin(time * 2.4 + n.layout.x * 0.01)
      const rg = ctx.createRadialGradient(x, y, radius * 0.7, x, y, radius * (2.4 + pulse * 0.6))
      rg.addColorStop(0, `hsla(${n.desc.hue},100%,88%,${0.32 * pulse})`)
      rg.addColorStop(0.5, 'rgba(255,107,214,.16)')
      rg.addColorStop(1, 'rgba(255,107,214,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(x, y, radius * (2.4 + pulse * 0.6), 0, TAU)
      ctx.fill()

      // diffraction spikes
      const spike = radius * (1.5 + pulse * 0.5)
      ctx.strokeStyle = `hsla(300,100%,85%,${0.22 * pulse})`
      ctx.lineWidth = Math.max(1, radius * 0.06)
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 4 + time * 0.1
        ctx.beginPath()
        ctx.moveTo(x - Math.cos(a) * spike, y - Math.sin(a) * spike)
        ctx.lineTo(x + Math.cos(a) * spike, y + Math.sin(a) * spike)
        ctx.stroke()
      }
      ctx.restore()
    }

    // mo only draw labels when zoomed in enough
    if (this.showLabels && scr > 14) {
      const label = n.user.name
      const fs = clamp(12 / this.cam.zoom, 9, 30)
      ctx.save()
      ctx.font = `500 ${fs}px "Space Grotesk", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const ty = y + radius * 1.35 + fs
      ctx.shadowColor = 'rgba(0,0,0,.9)'
      ctx.shadowBlur = 8
      ctx.fillStyle = isHover || isSel ? '#ffffff' : 'rgba(226,220,255,.72)'
      ctx.fillText(label, x, ty)
      if (n.hasNova && scr > 26) {
        ctx.font = `600 ${fs * 0.72}px "JetBrains Mono", monospace`
        ctx.fillStyle = 'rgba(255,150,235,.95)'
        ctx.fillText('SUPERNOVA', x, ty + fs * 1.25)
      }
      ctx.restore()
    }

    // selection reticle
    if (isSel) {
      ctx.save()
      ctx.strokeStyle = 'rgba(200,235,255,.85)'
      ctx.lineWidth = Math.max(1, 1.4 / this.cam.zoom)
      const r = radius * 1.6
      const gap = 0.35
      for (let i = 0; i < 4; i++) {
        const a0 = i * (Math.PI / 2) + gap + time * 0.35
        ctx.beginPath()
        ctx.arc(x, y, r, a0, a0 + Math.PI / 2 - gap * 2)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  private drawBurst(b: Burst) {
    const ctx = this.ctx
    const p = b.t / 1.8
    const rnd = mulberry32(b.seed)
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    // flash
    if (p < 0.18) {
      const a = 1 - p / 0.18
      const rg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 260)
      rg.addColorStop(0, `rgba(255,255,255,${a})`)
      rg.addColorStop(0.3, `hsla(${b.hue},100%,80%,${a * 0.8})`)
      rg.addColorStop(0.7, 'rgba(255,107,214,.3)')
      rg.addColorStop(1, 'rgba(255,107,214,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(b.x, b.y, 260, 0, TAU)
      ctx.fill()
    }
    // ring wave
    const rr = 40 + p * 420
    ctx.beginPath()
    ctx.arc(b.x, b.y, rr, 0, TAU)
    ctx.lineWidth = Math.max(0.5, 10 * (1 - p))
    ctx.strokeStyle = `hsla(${b.hue},100%,85%,${(1 - p) * 0.7})`
    ctx.stroke()

    // particle sparks
    const n = 26
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU
      const sp = 60 + rnd() * 300
      const x = b.x + Math.cos(a) * sp * p
      const y = b.y + Math.sin(a) * sp * p
      const alpha = (1 - p) * (0.4 + rnd() * 0.6)
      ctx.fillStyle = `hsla(${b.hue + rnd() * 80},100%,${75 + rnd() * 20}%,${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, 1 + rnd() * 2.4 * (1 - p), 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawWarp() {
    const ctx = this.ctx
    const { w, h } = this
    ctx.save()
    const cx = w / 2
    const cy = h / 2
    const n = Math.floor(140 * this.warp)
    const rnd = mulberry32(Math.floor(this.cam.x + this.cam.y))
    ctx.strokeStyle = `rgba(190,215,255,${0.16 * this.warp})`
    ctx.lineWidth = 1
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU
      const r0 = 40 + rnd() * 200
      const len = 60 + rnd() * 260 * this.warp
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
      ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len))
      ctx.stroke()
    }
    ctx.restore()
  }
}
