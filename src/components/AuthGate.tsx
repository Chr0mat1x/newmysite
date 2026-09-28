import { motion, AnimatePresence } from 'framer-motion'
import { useMemo, useState } from 'react'
import { PlanetBadge } from './PlanetBadge'
import { useGalaxy } from '../state/store'
import { sfx } from '../lib/audio'
import { planetSeed } from '../lib/seed'

/** How many procedural worlds the launch screen offers to pick from. */
const VARIANTS = [0, 1, 2, 3, 4, 5, 6, 7]

export function AuthGate() {
  const { login, users } = useGalaxy()
  const [mode, setMode] = useState<'enter' | 'pick'>('enter')
  const [handle, setHandle] = useState('')
  const [name, setName] = useState('')
  const [variant, setVariant] = useState(() => Math.floor(Math.random() * VARIANTS.length))

  const seed = useMemo(() => planetSeed(handle || 'orbit', name || 'traveler', variant), [handle, name, variant])

  const submit = () => {
    if (!handle.trim()) return
    login(handle, name || handle, variant)
  }

  return (
    <div className="relative z-20 flex min-h-[100dvh] items-center justify-center px-4 pb-safe pt-safe py-6 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-3xl border border-white/10 bg-black/40 p-5 backdrop-blur-2xl sm:p-7"
        style={{ boxShadow: '0 0 120px rgba(255,255,255,.09), inset 0 1px 0 rgba(255,255,255,.06)' }}
      >
        <div className="mb-5 text-center sm:mb-7">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
            className="mx-auto mb-4 h-16 w-16"
          >
            <PlanetBadge seed={seed} size={64} />
          </motion.div>
          <h1 className="font-display text-3xl font-bold tracking-[0.32em] text-white sm:text-4xl">ORBIT</h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.24em] text-pulse/80">
            your posts are satellites
          </p>
          <p className="mx-auto mt-3 max-w-xs text-[13px] leading-relaxed text-white/55 sm:mt-4 sm:text-sm">
            Every user is a planet. Every post orbits them. Fly through the galaxy instead of scrolling a feed.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'enter' ? (
            <motion.div
              key="enter"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -12 }}
              className="space-y-3"
            >
              <Field label="handle">
                <input
                  autoFocus
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="stardust"
                  autoComplete="username"
                  className="input"
                />
              </Field>
              <Field label="display name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="Dust of Stars"
                  autoComplete="nickname"
                  className="input"
                />
              </Field>
              <Field label="world">
                <div className="flex flex-wrap gap-2 pt-1">
                  {VARIANTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setVariant(v)
                        sfx.hover()
                      }}
                      aria-label={`world ${v + 1}`}
                      className={`h-12 w-12 rounded-full border transition-transform hover:scale-110 active:scale-95 ${
                        variant === v ? 'border-white' : 'border-white/15'
                      }`}
                      style={{
                        boxShadow: variant === v ? '0 0 16px rgba(255,255,255,.55)' : 'none',
                      }}
                    >
                      <PlanetBadge seed={planetSeed(handle || 'orbit', name || 'traveler', v)} size={44} />
                    </button>
                  ))}
                </div>
              </Field>
              <button
                onClick={submit}
                disabled={!handle.trim()}
                className="tap mt-2 w-full rounded-xl bg-gradient-to-r from-pulse to-glow py-3 font-display text-sm font-semibold tracking-wider text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30"
              >
                LAUNCH INTO ORBIT
              </button>
              <button
                onClick={() => setMode('pick')}
                className="tap w-full py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/80 active:text-white/80"
              >
                or enter as an existing planet →
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="pick"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <div className="mb-2 max-h-[45dvh] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
                {users
                  .filter((u) => u.mock)
                  .slice(0, 14)
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => login(u.handle, u.name)}
                      onMouseEnter={() => sfx.hover()}
                      className="tap flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2 text-left transition-all hover:border-pulse/40 hover:bg-white/[0.07] active:bg-white/[0.07]"
                    >
                      <PlanetBadge seed={u.seed} size={32} />
                      <div className="min-w-0">
                        <div className="truncate text-sm text-white/90">{u.name}</div>
                        <div className="truncate font-mono text-[10px] text-white/40">@{u.handle}</div>
                      </div>
                    </button>
                  ))}
              </div>
              <button
                onClick={() => setMode('enter')}
                className="tap w-full py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/80 active:text-white/80"
              >
                ← create a new planet
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</span>
      {children}
    </label>
  )
}
