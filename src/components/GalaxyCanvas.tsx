import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { GalaxyEngine, type RenderStats } from '../engine/GalaxyCanvas'
import { layoutGalaxy } from '../engine/layout'
import { useGalaxy } from '../state/store'
import type { Post, User } from '../types'

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
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      eng.resize(w, h, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    // start centred on me (or on the richest planet for a guest)
    const me = currentUser ? seed.layouts.find((l) => l.id === currentUser.id) : null
    const start =
      me ??
      seed.layouts.slice().sort((a, b) => b.activity - a.activity)[0] ??
      { x: 0, y: 0 }
    eng.snap(start.x, start.y, me ? 1.0 : 1.15)

    // --- pointer interaction ---------------------------------------------
    let dragging = false
    let moved = false
    let last = { x: 0, y: 0 }
    let pointer = { x: -1, y: -1 }

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      if (!interactive) return
      dragging = true
      moved = false
      last = pos(e)
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      pointer = pos(e)
      if (!interactive) return
      if (dragging) {
        const p = pos(e)
        const dx = (p.x - last.x) / eng.cam.zoom
        const dy = (p.y - last.y) / eng.cam.zoom
        if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) > 2) moved = true
        eng.cam.x -= dx
        eng.cam.y -= dy
        eng.target.x = eng.cam.x
        eng.target.y = eng.cam.y
        last = p
      }
    }
    const onUp = (e: PointerEvent) => {
      if (!interactive) return
      const wasDrag = moved
      dragging = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      if (wasDrag) return
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

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

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
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
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
