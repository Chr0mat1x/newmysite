/**
 * Starfield — four parallax layers of stars plus slow-drifting nebula blobs.
 * Drawn in screen space with wrap-around tiling so it is truly infinite.
 */
import { mulberry32, hashString } from '../lib/procgen'
import { TAU } from '../lib/math'

interface Star {
  x: number
  y: number
  r: number
  base: number
  twinkle: number
  phase: number
}

interface Layer {
  stars: Star[]
  /** parallax factor: 0 = pinned to camera, 1 = moves with the world */
  depth: number
}

interface Nebula {
  x: number
  y: number
  r: number
  hue: number
  alpha: number
}

export class Starfield {
  layers: Layer[] = []
  nebulae: Nebula[] = []
  private w = 0
  private h = 0
  private tile = 2600
  private seed: number
  private far: Star[] = []

  constructor(seed = 1337) {
    this.seed = seed
    this.build()
  }

  build() {
    const rnd = mulberry32(this.seed)
    const configs = [
      { count: 260, tile: 900, depth: 0.055, rMax: 0.9 },
      { count: 180, tile: 1700, depth: 0.16, rMax: 1.3 },
      { count: 120, tile: 2900, depth: 0.34, rMax: 1.8 },
      { count: 70, tile: 4400, depth: 0.6, rMax: 2.4 },
    ]
    this.layers = configs.map((cfg) => {
      const stars: Star[] = Array.from({ length: cfg.count }, () => ({
        x: rnd() * cfg.tile,
        y: rnd() * cfg.tile,
        r: 0.5 + rnd() * cfg.rMax,
        base: 0.28 + rnd() * 0.72,
        twinkle: 0.4 + rnd() * 2.4,
        phase: rnd() * TAU,
      }))
      return { stars, depth: cfg.depth }
    })
    // one fixed far layer that ignores the camera entirely — depth anchor
    this.far = Array.from({ length: 340 }, () => ({
      x: rnd(),
      y: rnd(),
      r: 0.35 + rnd() * 0.7,
      base: 0.15 + rnd() * 0.5,
      twinkle: 0.5 + rnd() * 2,
      phase: rnd() * TAU,
    }))

    // nebulae stay in the violet→magenta→indigo band so the palette reads
    // as one deep "black-purple" cosmos rather than a muddy rainbow
    this.nebulae = Array.from({ length: 7 }, () => {
      const bands = [258, 275, 292, 312, 330, 224]
      const hue = bands[Math.floor(rnd() * bands.length)] + (rnd() - 0.5) * 12
      return {
        x: rnd() * 6000 - 3000,
        y: rnd() * 6000 - 3000,
        r: 900 + rnd() * 1500,
        hue,
        alpha: 0.05 + rnd() * 0.06,
      }
    })
  }

  resize(w: number, h: number) {
    this.w = w
    this.h = h
  }

  /** @param camX/camY world-space camera centre */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number) {
    const { w, h } = this

    // deep background gradient
    const g = ctx.createLinearGradient(0, 0, w * 0.6, h)
    g.addColorStop(0, '#05030c')
    g.addColorStop(0.45, '#090518')
    g.addColorStop(1, '#03020a')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    // nebulae (world-locked, very soft)
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    for (const n of this.nebulae) {
      const sx = w / 2 + (n.x - camX) * 0.12
      const sy = h / 2 + (n.y - camY) * 0.12
      if (sx < -n.r || sx > w + n.r || sy < -n.r || sy > h + n.r) continue
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, n.r)
      rg.addColorStop(0, `hsla(${n.hue},70%,52%,${n.alpha})`)
      rg.addColorStop(0.5, `hsla(${n.hue - 28},80%,44%,${n.alpha * 0.5})`)
      rg.addColorStop(1, 'hsla(0,0%,0%,0)')
      ctx.fillStyle = rg
      ctx.fillRect(sx - n.r, sy - n.r, n.r * 2, n.r * 2)
    }
    ctx.restore()

    // fixed distant stars
    for (const s of this.far) {
      const a = s.base * (0.62 + 0.38 * Math.sin(time * s.twinkle + s.phase))
      ctx.fillStyle = `rgba(255,255,255,${a * 0.7})`
      ctx.fillRect(s.x * w, s.y * h, s.r, s.r)
    }

    // parallax layers
    for (const layer of this.layers) {
      const tile = layer.stars.length
        ? Math.max(...layer.stars.map((s) => s.x)) + 200
        : this.tile
      const tileW = tile
      const tileH = tile
      const offX = -camX * layer.depth
      const offY = -camY * layer.depth
      for (const s of layer.stars) {
        let sx = ((s.x + offX) % tileW + tileW) % tileW
        let sy = ((s.y + offY) % tileH + tileH) % tileH
        // tile across the viewport
        for (let tx = sx; tx < w; tx += tileW) {
          for (let ty = sy; ty < h; ty += tileH) {
            const a = s.base * (0.55 + 0.45 * Math.sin(time * s.twinkle + s.phase))
            if (a <= 0.02) continue
            ctx.fillStyle = `rgba(${220 + Math.floor(a * 35)},${228 + Math.floor(a * 27)},255,${a})`
            ctx.beginPath()
            ctx.arc(tx, ty, s.r, 0, TAU)
            ctx.fill()
          }
        }
      }
    }
  }
}
