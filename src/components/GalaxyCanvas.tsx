import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { GalaxyEngine, type RenderStats } from '../engine/GalaxyCanvas'
import { layoutGalaxy } from '../engine/layout'
import { useGalaxy } from '../state/store'
import type { Post, User } from '../types'
import { clamp } from '../lib/math'
import { usePrefersReducedMotion } from '../lib/useMedia'

export interface GalaxyHandle {
  engine: GalaxyEngine | null
  flyToPlanet: (userId: string, zoom?: number) => void
  focusOn: (x: number, y: number, zoom: number) => void
  centerOnMe: () => void
  select: (id: string | null) => void
  nudge: (dx: number, dy: number) => void
}

interface Props {
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
  onStats?: (s: RenderStats) => void
  interactive?: boolean
}

export const GalaxyCanvas = forwardRef<GalaxyHandle, Props>(function GalaxyCanvas(
  { onHover, onSelect, onStats, interactive = true },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GalaxyEngine | null>(null)
  const hoverRef = useRef<string | null>(null)
  const reducedMotion = usePrefersReducedMotion()
  const reducedRef = useRef(reducedMotion)
  reducedRef.current = reducedMotion
  const { state, users, currentUser } = useGalaxy()

  const layouts = useMemo(() => {
    const scoreOf = (userId: string) => {
      const mine = Object.values(state.posts).filter((p) => p.authorId === userId)
      return {
        posts: mine.length,
        likes: mine.reduce((a, p) => a + p.likes.length, 0),
        signals: mine.reduce((a, p) => a + p.signals.length, 0),
      }
    }
    // current user always sits at the centre of their own galaxy
    return layoutGalaxy(users, scoreOf)
  }, [users, state.posts])

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const postsByAuthor = useMemo(() => {
    const m = new Map<string, Post[]>()
    for (const p of Object.values(state.posts)) {
      const arr = m.get(p.authorId) ?? []
      arr.push(p)
      m.set(p.authorId, arr)
    }
    return m
  }, [state.posts])

  // keep engine data in sync — latest values are mirrored into refs so the
  // engine can be seeded the instant it is created (see the effect below).
  const dataRef = useRef<{
    layouts: typeof layouts
    users: Map<string, User>
    posts: Map<string, Post[]>
  }>({ layouts, users: userMap as Map<string, User>, posts: postsByAuthor })
  dataRef.current = { layouts, users: userMap as Map<string, User>, posts: postsByAuthor }

  useEffect(() => {
    const eng = engineRef.current
    if (!eng) return
    eng.setData(layouts, userMap as Map<string, User>, postsByAuthor)
  }, [layouts, userMap, postsByAuthor])

  useImperativeHandle(ref, () => ({
    engine: engineRef.current,
    flyToPlanet(userId: string, zoom = 1.55) {
      const eng = engineRef.current
      if (!eng) return
      const node = eng.getNode(userId)
      if (!node) return
      eng.select(userId)
      eng.flyTo(node.layout.x, node.layout.y, zoom, 1600)
    },
    focusOn(x, y, zoom) {
      engineRef.current?.flyTo(x, y, zoom, 1400)
    },
    centerOnMe() {
      const eng = engineRef.current
      if (!eng || !currentUser) return
      const node = eng.getNode(currentUser.id)
      if (node) eng.flyTo(node.layout.x, node.layout.y, 1.7, 1500)
    },
    select(id) {
      if (engineRef.current) engineRef.current.selected = id
    },
    nudge(dx, dy) {
      const eng = engineRef.current
      if (!eng) return
      eng.panTo(eng.target.x + dx, eng.target.y + dy)
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const eng = new GalaxyEngine(canvas)
    engineRef.current = eng

    // seed immediately — the data-sync effect runs before this one on mount
    const seed = dataRef.current
    eng.setData(seed.layouts, seed.users, seed.posts)

    const resize = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      // Retina phones report dpr 3–4; the backing store grows with the square of
      // dpr while the visible detail barely changes at arm's length. Cap it so a
      // small screen still renders crisply without paying 4–9x the fill cost.
      const cap = w <= 480 ? 2 : w <= 900 ? 1.5 : 2
      const dpr = Math.min(window.devicePixelRatio || 1, cap)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      eng.resize(w, h, dpr)
    }
    resize()
    window.addEventListener('resize', resize)
    // follows the window between displays / when the browser zoom changes dpr
    const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    dprQuery.addEventListener('change', resize)

    // start centred on me (or on the richest planet for a guest)
    const me = currentUser ? seed.layouts.find((l) => l.id === currentUser.id) : null
    const start =
      me ??
      seed.layouts.slice().sort((a, b) => b.activity - a.activity)[0] ??
      { x: 0, y: 0 }
    eng.snap(start.x, start.y, me ? 1.0 : 1.15)

    // --- pointer interaction ---------------------------------------------
    // Tracks every active pointer so two fingers can pinch-zoom while a single
    // finger pans. A tap is only treated as a selection when it is short and
    // barely moves — fingers always drift a few pixels on a touchscreen.
    const active = new Map<number, { x: number; y: number }>()
    let dragging = false
    let moved = false
    let last = { x: 0, y: 0 }
    let pointer = { x: -1, y: -1 }
    let downAt = 0
    let pinch: { dist: number; zoom: number; mid: { x: number; y: number } } | null = null

    const TAP_SLOP = 10

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const pinchState = () => {
      const [a, b] = [...active.values()]
      if (!a || !b) return null
      return {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
    }

    const onDown = (e: PointerEvent) => {
      if (!interactive) return
      const p = pos(e)
      active.set(e.pointerId, p)
      // capture keeps events flowing when the finger leaves the canvas, but it
      // throws for synthetic/non-active pointers — never let that kill the tap
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      if (active.size === 1) {
        dragging = true
        moved = false
        downAt = performance.now()
        last = p
        pinch = null
      } else if (active.size === 2) {
        const s = pinchState()
        if (s) {
          dragging = false
          moved = true // a pinch is never a tap
          pinch = { dist: Math.max(1, s.dist), zoom: eng.target.zoom, mid: s.mid }
        }
      }
    }
    const onMove = (e: PointerEvent) => {
      const p = pos(e)
      if (!active.has(e.pointerId)) {
        // plain mouse hover — no button held and not touching
        if (e.pointerType === 'mouse') pointer = p
        return
      }
      active.set(e.pointerId, p)
      if (!interactive) return

      if (active.size >= 2) {
        const s = pinchState()
        if (!s) return
        if (!pinch) pinch = { dist: Math.max(1, s.dist), zoom: eng.target.zoom, mid: s.mid }
        // zoom about the midpoint, and let the midpoint drag the camera too
        const z = clamp(pinch.zoom * (s.dist / pinch.dist), 0.28, 3.4)
        eng.target.zoom = z
        eng.flight = null
        const dx = (s.mid.x - pinch.mid.x) / z
        const dy = (s.mid.y - pinch.mid.y) / z
        eng.cam.x -= dx
        eng.cam.y -= dy
        eng.target.x = eng.cam.x
        eng.target.y = eng.cam.y
        pinch.mid = s.mid
        last = p
        return
      }

      if (dragging) {
        const dx = (p.x - last.x) / eng.cam.zoom
        const dy = (p.y - last.y) / eng.cam.zoom
        if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) > TAP_SLOP) moved = true
        eng.cam.x -= dx
        eng.cam.y -= dy
        eng.target.x = eng.cam.x
        eng.target.y = eng.cam.y
        last = p
      }
    }
    const onUp = (e: PointerEvent) => {
      if (!interactive) return
      const wasPinch = active.size >= 2 || pinch !== null
      active.delete(e.pointerId)
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      if (active.size === 0) {
        dragging = false
        pinch = null
      } else if (active.size === 1) {
        // lifting one finger of a pinch: re-anchor the survivor so the camera
        // does not jump when it becomes a pan again
        const [only] = [...active.values()]
        last = only
      }
      if (wasPinch || moved) return
      if (performance.now() - downAt > 500) return
      const p = pos(e)
      const id = eng.planetAt(p.x, p.y)
      onSelect(id)
      eng.selected = id
      if (id) {
        const node = eng.getNode(id)!
        eng.flyTo(node.layout.x, node.layout.y, Math.max(1.45, eng.cam.zoom), 1300)
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (!interactive) return
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.0012)
      const z = Math.max(0.28, Math.min(3.4, eng.target.zoom * factor))
      eng.target.zoom = z
      eng.flight = null
    }
    // iOS Safari still fires gesture events for pinch on some versions
    const onGesture = (e: Event) => e.preventDefault()

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('gesturestart', onGesture)
    canvas.addEventListener('gesturechange', onGesture)

    // --- render loop ------------------------------------------------------
    let raf = 0
    let lastT = performance.now()
    let frames = 0
    let fpsT = lastT
    let fps = 60
    let hoverCheck = 0
    let statT = 0

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now
      frames++
      if (now - fpsT > 500) {
        fps = Math.round((frames * 1000) / (now - fpsT))
        frames = 0
        fpsT = now
      }
      // hover detection throttled to ~20Hz
      hoverCheck += dt
      if (hoverCheck > 0.05 && interactive) {
        hoverCheck = 0
        const id = pointer.x >= 0 ? eng.planetAt(pointer.x, pointer.y) : null
        if (id !== hoverRef.current) {
          hoverRef.current = id
          eng.hovered = id
          onHover(id)
        }
      }
      eng.reduced = reducedRef.current
      eng.update(dt, now / 1000)
      const stats = eng.render(now / 1000)
      // push stats at ~4Hz so React never re-renders per frame
      statT += dt
      if (statT > 0.25) {
        statT = 0
        onStats?.({ fps, visible: stats.visible, total: stats.total })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      dprQuery.removeEventListener('change', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('gesturestart', onGesture)
      canvas.removeEventListener('gesturechange', onGesture)
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none select-none"
      style={{ cursor: hoverRef.current ? 'pointer' : 'grab' }}
    />
  )
})
