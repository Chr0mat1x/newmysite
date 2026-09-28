import { motion } from 'framer-motion'
import { useMemo, useRef, useState } from 'react'
import type { User } from '../types'
import { PlanetBadge } from './PlanetBadge'
import { TAU } from '../lib/math'

export interface MiniPlanet {
  id: string
  x: number
  y: number
  r: number
  nova: boolean
}

export const MINI_WORLD = 3400

export function MiniMap({
  planets,
  cam,
  meId,
  onJump,
}: {
  planets: MiniPlanet[]
  cam: { x: number; y: number; zoom: number }
  meId: string | null
  onJump: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const size = 128
  const scale = size / (MINI_WORLD * 2.05)
  const [hover, setHover] = useState<string | null>(null)

  const toScreen = (x: number) => size / 2 + x * scale
  const viewW = (typeof window !== 'undefined' ? window.innerWidth : 1200) * scale / cam.zoom
  const viewH = (typeof window !== 'undefined' ? window.innerHeight : 800) * scale / cam.zoom

  const hovered = useMemo(() => planets.find((p) => p.id === hover), [hover, planets])

  return (
    <div className="relative">
      {hovered && (
        <MiniTooltip planet={hovered} />
      )}
      <div
        ref={ref}
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/45 backdrop-blur-xl"
        style={{ width: size, height: size, boxShadow: '0 8px 40px rgba(0,0,0,.6)' }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,.12), transparent 70%)' }} />
        {planets.map((p) => {
          const isMe = p.id === meId
          const isHover = p.id === hover
          const r = Math.max(1.4, p.r * scale * 1.6)
          return (
            <button
              key={p.id}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
              onClick={() => onJump(p.id)}
              className="absolute rounded-full transition-transform hover:scale-150"
              style={{
                left: toScreen(p.x) - r,
                top: toScreen(p.y) - r,
                width: r * 2,
                height: r * 2,
                background: p.nova ? '#ffffff' : 'rgba(255,255,255,.55)',
                boxShadow: isMe || isHover || p.nova ? '0 0 8px rgba(255,255,255,.55)' : 'none',
                outline: isMe ? '1.5px solid rgba(255,255,255,.9)' : 'none',
                outlineOffset: 1.5,
                zIndex: isHover ? 10 : 1,
              }}
              aria-label={p.id}
            />
          )
        })}

        {/* camera viewport rect */}
        <div
          className="pointer-events-none absolute border border-glow/50"
          style={{
            left: toScreen(cam.x) - viewW / 2,
            top: toScreen(cam.y) - viewH / 2,
            width: viewW,
            height: viewH,
            boxShadow: '0 0 12px rgba(255,255,255,.28)',
          }}
        />

        <div className="pointer-events-none absolute bottom-1 left-0 right-0 text-center font-mono text-[8px] uppercase tracking-[0.2em] text-white/30">
          galaxy map
        </div>
      </div>
    </div>
  )
}

function MiniTooltip({ planet }: { planet: MiniPlanet }) {
  const { user } = planet as MiniPlanet & { user?: User }
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-black/80 px-2 py-1 font-mono text-[9px] text-white/70 backdrop-blur"
    >
      {planet.nova ? '★ supernova planet' : `planet ${planet.id.slice(0, 6)}`}
    </motion.div>
  )
}
