import { motion, AnimatePresence } from 'framer-motion'
import { useMemo, useState } from 'react'
import { PlanetBadge } from './PlanetBadge'
import { useGalaxy } from '../state/store'
import { sfx } from '../lib/audio'
import { planetSeed } from '../lib/seed'
import { PASSWORD_MIN } from '../lib/auth'

/** How many procedural worlds the launch screen offers to pick from. */
const VARIANTS = [0, 1, 2, 3, 4, 5, 6, 7]

type Mode = 'signup' | 'signin' | 'explore'

export function AuthGate() {
  const { login, signUp, loginAs, users, postsOf, busy } = useGalaxy()
  const [mode, setMode] = useState<Mode>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [variant, setVariant] = useState(() => Math.floor(Math.random() * VARIANTS.length))

  const seed = useMemo(
    () => planetSeed(name || email.split('@')[0] || 'orbit', name || 'traveler', variant),
    [email, name, variant],
  )

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  const submit = async () => {
    const err =
      mode === 'signin'
        ? await login(email, password)
        : await signUp(email, password, name, variant)
    setError(err)
  }

  // Seeded demo planets first, then the liveliest ones — so the visitor list is
  // never drowned out by empty accounts created during testing.
  const explore = [...users]
    .sort((a, b) => {
      if (!!a.mock !== !!b.mock) return Number(!!b.mock) - Number(!!a.mock)
      const byPosts = postsOf(b.id).length - postsOf(a.id).length
      return byPosts || a.handle.localeCompare(b.handle)
    })
    .slice(0, 18)

  return (
    <div className="relative z-20 flex min-h-[100dvh] items-center justify-center px-4 py-6 pb-safe pt-safe sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="flex max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-5 backdrop-blur-2xl sm:max-h-[90dvh] sm:p-7"
        style={{ boxShadow: '0 0 120px rgba(255,255,255,.09), inset 0 1px 0 rgba(255,255,255,.06)' }}
      >
        <div className="mb-5 shrink-0 text-center sm:mb-7">
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
          {mode === 'explore' ? (
            <motion.div
              key="explore"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain"
            >
              <div className="mb-2 space-y-1.5 pr-1">
                {explore.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      sfx.click()
                      void loginAs(u.id)
                    }}
                    disabled={busy}
                    onMouseEnter={() => sfx.hover()}
                    className="tap flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2 text-left transition-all hover:border-pulse/40 hover:bg-white/[0.07] active:bg-white/[0.07] disabled:opacity-50"
                  >
                    <PlanetBadge seed={u.seed} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-sm text-white/90">{u.name}</div>
                      <div className="truncate font-mono text-[10px] text-white/40">@{u.handle}</div>
                    </div>
                    {!u.mock && (
                      <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">yours</span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => switchMode('signin')}
                className="tap w-full py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/80 active:text-white/80"
              >
                ← back to sign in
              </button>
            </motion.div>
          ) : (
            <motion.div
              key={mode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -12 }}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain"
            >
              <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {(['signup', 'signin'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={`tap flex-1 rounded-lg py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                      mode === m ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    {m === 'signup' ? 'create planet' : 'sign in'}
                  </button>
                ))}
              </div>

              {mode === 'signup' && (
                <Field label="display name">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    placeholder="Nova Ashkar"
                    autoComplete="nickname"
                    className="input"
                  />
                </Field>
              )}

              <Field label="email">
                <input
                  autoFocus={mode === 'signin'}
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="you@orbit.space"
                  autoComplete="email"
                  className="input"
                />
              </Field>

              <Field label="password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder={mode === 'signup' ? `at least ${PASSWORD_MIN} characters` : '••••••••'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="input"
                />
              </Field>

              {mode === 'signup' && (
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
                        style={{ boxShadow: variant === v ? '0 0 16px rgba(255,255,255,.55)' : 'none' }}
                      >
                        <PlanetBadge seed={planetSeed(name || 'orbit', name || 'traveler', v)} size={44} />
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              {error && (
                <p role="alert" className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] text-white/70">
                  {error}
                </p>
              )}

              <button
                onClick={() => void submit()}
                disabled={!email.trim() || !password || busy}
                className="tap mt-1 w-full rounded-xl bg-gradient-to-r from-pulse to-glow py-3 font-display text-sm font-semibold tracking-wider text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30"
              >
                {busy
                  ? 'CONTACTING ORBIT…'
                  : mode === 'signup'
                    ? 'LAUNCH INTO ORBIT'
                    : 'ENTER ORBIT'}
              </button>
              <button
                onClick={() => switchMode('explore')}
                className="tap w-full py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/80 active:text-white/80"
              >
                or explore a demo planet →
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
