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

    // nebulae are achromatic: soft grey light-lifts in the void rather than
    // coloured clouds, so the whole frame stays black-and-white
    this.nebulae = Array.from({ length: 7 }, () => ({
      x: rnd() * 6000 - 3000,
      y: rnd() * 6000 - 3000,
      r: 900 + rnd() * 1500,
      alpha: 0.04 + rnd() * 0.05,
    }))
  }

  resize(w: number, h: number) {
    this.w = w
    this.h = h
  }

  /** @param camX/camY world-space camera centre */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number) {
    const { w, h } = this

    // deep background: pure black with only the faintest graphite lift
    const g = ctx.createLinearGradient(0, 0, w * 0.6, h)
    g.addColorStop(0, '#000000')
    g.addColorStop(0.45, '#0a0a0a')
    g.addColorStop(1, '#020202')
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
      rg.addColorStop(0, `hsla(0,0%,72%,${n.alpha})`)
      rg.addColorStop(0.5, `hsla(0,0%,50%,${n.alpha * 0.5})`)
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

    // Parallax layers. Stars are drawn as squares rather than arcs: at 0.5–2.4px
    // the difference is invisible, but one fillRect per star instead of
    // beginPath+arc+fill keeps hundreds of stars per frame cheap on a phone.
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
        const a = s.base * (0.55 + 0.45 * Math.sin(time * s.twinkle + s.phase))
        if (a <= 0.02) continue
        ctx.fillStyle = `rgba(255,255,255,${a})`
        const size = s.r * 2
        // tile across the viewport
        for (let tx = sx; tx < w; tx += tileW) {
          for (let ty = sy; ty < h; ty += tileH) {
            ctx.fillRect(tx - s.r, ty - s.r, size, size)
          }
        }
      }
    }
  }
}
