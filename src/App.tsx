import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GalaxyProvider, useGalaxy } from './state/store'
import { GalaxyCanvas, type GalaxyHandle } from './components/GalaxyCanvas'
import { AuthGate } from './components/AuthGate'
import { OrbitView } from './components/OrbitView'
import { Composer } from './components/Composer'
import { SupernovaFeed } from './components/SupernovaFeed'
import { MiniMap, type MiniPlanet, MINI_WORLD } from './components/MiniMap'
import { MobileMenu } from './components/MobileMenu'
import { LinkEmailInline } from './components/LinkEmailInline'
import { CommandPalette } from './components/CommandPalette'
import { SignalsConsole } from './components/SignalsConsole'
import { Toasts, type Toast } from './components/Toasts'
import { Onboarding } from './components/Onboarding'
import { AccountSettings } from './components/AccountSettings'
import { PlanetBadge } from './components/PlanetBadge'
import { layoutGalaxy } from './engine/layout'
import type { RenderStats } from './engine/GalaxyCanvas'
import { useIsMobile } from './lib/useMedia'
import { isMuted, setMuted, startAmbient, resumeAudio, sfx } from './lib/audio'

function Orbit() {
  const { currentUser, users, state, logout, resetGalaxy, supernovas, userById, following, savedPosts, transmissions, mode, linkStatus, busy, lastError, clearLastError, initialFocus, clearInitialFocus } =
    useGalaxy()
  const handleRef = useRef<GalaxyHandle>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [novaOpen, setNovaOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleTab, setConsoleTab] = useState<'transmissions' | 'constellation' | 'cargo'>('transmissions')
  const [onboarding, setOnboarding] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [stats, setStats] = useState<RenderStats>({ fps: 60, visible: 0, total: 0 })
  const [muted, setMute] = useState(isMuted())
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isMobile = useIsMobile()
  const novaCount = useRef<number | null>(null)

  const layouts = useMemo(() => {
    const scoreOf = (userId: string) => {
      const mine = Object.values(state.posts).filter((p) => p.authorId === userId)
      return {
        posts: mine.length,
        likes: mine.reduce((a, p) => a + p.likes.length, 0),
        signals: mine.reduce((a, p) => a + p.signals.length, 0),
      }
    }
    return layoutGalaxy(users, scoreOf)
  }, [users, state.posts])

  const minimap = useMemo<MiniPlanet[]>(
    () =>
      layouts.map((l) => {
        const u = userById(l.id)
        return {
          id: l.id,
          x: l.x,
          y: l.y,
          r: l.radius,
          name: u?.name,
          handle: u?.handle,
          nova: Object.values(state.posts).some(
            (p) => p.authorId === l.id && p.supernovaAt && Date.now() - p.supernovaAt < 86400000,
          ),
        }
      }),
    [layouts, state.posts, userById],
  )

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev.slice(-2), { ...t, id }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6500)
  }, [])

  // onboarding on first ever visit
  useEffect(() => {
    if (!localStorage.getItem('orbit.onboarded')) setOnboarding(true)
  }, [])

  // debut ambient once the user interacts
  useEffect(() => {
    const go = () => {
      resumeAudio()
      startAmbient()
    }
    window.addEventListener('pointerdown', go, { once: true })
    window.addEventListener('keydown', go, { once: true })
    return () => {
      window.removeEventListener('pointerdown', go)
      window.removeEventListener('keydown', go)
    }
  }, [])

  // supernova detection -> global toast + burst
  useEffect(() => {
    if (novaCount.current === null) {
      novaCount.current = supernovas.length
      return
    }
    if (supernovas.length > novaCount.current) {
      const fresh = supernovas[0]
      const author = userById(fresh.authorId)
      sfx.supernova()
      pushToast({
        kind: 'nova',
        title: '★ SUPERNOVA DETECTED',
        body: `@${author?.handle ?? 'someone'} just lit up the whole galaxy. Visible for 24 hours.`,
      })
      const eng = handleRef.current?.engine
      if (eng) {
        const node = eng.getNode(fresh.authorId)
        if (node) eng.spawnBurst(node.layout.x, node.layout.y)
      }
    }
    novaCount.current = supernovas.length
  }, [supernovas, userById, pushToast])

  // surface backend failures as a toast, then clear so it fires once
  useEffect(() => {
    if (!lastError) return
    pushToast({ kind: 'nova', title: 'TRANSMISSION FAILED', body: lastError })
    clearLastError()
  }, [lastError, clearLastError, pushToast])

  // keyboard flight
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'
      // ⌘K / Ctrl+K opens the palette even while typing; '/' opens it when idle
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        sfx.click()
        setPaletteOpen((o) => !o)
        return
      }
      if (e.key === '/' && !typing) {
        e.preventDefault()
        sfx.click()
        setPaletteOpen(true)
        return
      }
      if (typing) return
      const step = 420
      if (e.key === 'ArrowLeft' || e.key === 'a') handleRef.current?.nudge(-step, 0)
      if (e.key === 'ArrowRight' || e.key === 'd') handleRef.current?.nudge(step, 0)
      if (e.key === 'ArrowUp' || e.key === 'w') handleRef.current?.nudge(0, -step)
      if (e.key === 'ArrowDown' || e.key === 's') handleRef.current?.nudge(0, step)
      if (e.key === 'c') handleRef.current?.centerOnMe()
      if (e.key === 'f') handleRef.current?.flyToPlanet(following[0]?.id ?? '', 1.6)
      if (e.key === 'Escape') {
        // close the topmost overlay first, then deselect
        setPaletteOpen((open) => {
          if (open) return false
          setConsoleOpen((c) => {
            if (c) return false
            setComposerOpen((co) => {
              if (co) return false
              setNovaOpen((n) => {
                if (n) return false
                setMenuOpen((m) => {
                  if (m) return false
                  setSelected(null)
                  return m
                })
                return n
              })
              return co
            })
            return c
          })
          return open
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [following])

  const visit = useCallback((id: string) => {
    setSelected(id)
    handleRef.current?.select(id)
    handleRef.current?.flyToPlanet(id, 1.6)
  }, [])

  // Flying somewhere always dismisses the overlays that could sit on top of the
  // orbit panel — otherwise their backdrops swallow the tap that opened it.
  const goTo = useCallback(
    (id: string) => {
      setConsoleOpen(false)
      setMenuOpen(false)
      visit(id)
    },
    [visit],
  )

  const openConsole = useCallback((tab: 'transmissions' | 'constellation' | 'cargo') => {
    sfx.click()
    setConsoleTab(tab)
    setConsoleOpen(true)
  }, [])

  // A visitor picked a demo planet — fly them to it once the galaxy is loaded.
  // The focus flag is cleared *inside* the timeout: clearing it up front would
  // change this effect's deps and its cleanup would cancel the flight.
  useEffect(() => {
    if (!initialFocus) return
    const target = initialFocus
    const t = setTimeout(() => {
      if (userById(target)) visit(target)
      clearInitialFocus()
    }, 500)
    return () => clearTimeout(t)
  }, [initialFocus, clearInitialFocus, userById, visit])

  const flyRandom = useCallback(() => {
    sfx.launch()
    const others = layouts.filter((l) => l.id !== currentUser?.id)
    const pick = others[Math.floor(Math.random() * others.length)]
    if (pick) visit(pick.id)
  }, [layouts, currentUser, visit])

  // A tap opens the orbit panel on pointerup; the browser then fires a synthetic
  // click at the same spot, which would land on the just-mounted backdrop and
  // close the panel instantly. Ignore backdrop clicks for a beat after a visit.
  const visitGuard = useRef(0)
  const visitWithGuard = useCallback(
    (id: string | null) => {
      // empty-space taps deselect immediately; only real selections are guarded
      if (!id) {
        setSelected(null)
        return
      }
      visitGuard.current = performance.now()
      visit(id)
    },
    [visit],
  )
  const closeIfSettled = useCallback(() => {
    if (performance.now() - visitGuard.current < 400) return
    setSelected(null)
  }, [])

  const meStats = useMemo(() => {
    if (!currentUser) return { posts: 0, likes: 0, signals: 0 }
    const mine = Object.values(state.posts).filter((p) => p.authorId === currentUser.id)
    return {
      posts: mine.length,
      likes: mine.reduce((a, p) => a + p.likes.length, 0),
      signals: mine.reduce((a, p) => a + p.signals.length, 0),
    }
  }, [state.posts, currentUser])

  const leaders = useMemo(
    () => layouts.slice().sort((a, b) => b.activity - a.activity).slice(0, 4),
    [layouts],
  )

  const hoveredUser = hovered ? userById(hovered) : null

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-void font-body text-white">
      <GalaxyCanvas ref={handleRef} onHover={setHovered} onSelect={visitWithGuard} onStats={setStats} />

      {/* vignette for the cinematic feel */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,.72) 100%)' }}
      />

      {/* ---------- top bar ---------- */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 pt-safe sm:gap-3 sm:p-5">
        <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => handleRef.current?.centerOnMe()}
            className="tap group flex items-center gap-3 rounded-2xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl transition-colors hover:border-pulse/40 active:border-pulse/40"
          >
            <svg width="22" height="22" viewBox="0 0 32 32" className="transition-transform group-hover:rotate-180 duration-700">
              <circle cx="16" cy="16" r="6.5" fill="#f5f5f5" />
              <ellipse
                cx="16"
                cy="16"
                rx="13.5"
                ry="4.8"
                fill="none"
                stroke="#8a8a8a"
                strokeWidth="1.3"
                transform="rotate(-25 16 16)"
              />
            </svg>
            <div className="text-left">
              <div className="font-display text-sm font-bold tracking-[0.28em] text-white">ORBIT</div>
              <div className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 sm:block">
                your posts are satellites
              </div>
            </div>
          </button>

          {currentUser && (
            <button
              onClick={() => goTo(currentUser.id)}
              onMouseEnter={() => sfx.hover()}
              className="hidden items-center gap-2.5 rounded-2xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl transition-colors hover:border-pulse/40 sm:flex"
            >
              <PlanetBadge seed={currentUser.seed} size={30} />
              <div className="text-left">
                <div className="font-display text-[12px] text-white/90">{currentUser.name}</div>
                <div className="font-mono text-[9px] text-white/40">
                  {meStats.posts} satellites · {meStats.likes} stars
                </div>
              </div>
            </button>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => {
              sfx.click()
              setPaletteOpen(true)
            }}
            aria-label="search the galaxy"
            className="tap hidden items-center gap-2 rounded-2xl border border-white/10 bg-black/45 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/50 backdrop-blur-xl transition-colors hover:border-pulse/40 hover:text-white sm:flex"
          >
            <span>⌕ search</span>
            <kbd className="rounded border border-white/12 px-1.5 py-0.5 text-[9px] text-white/35">⌘K</kbd>
          </button>

          {currentUser && (
            <button
              onClick={() => openConsole('transmissions')}
              aria-label="open signals console"
              className="tap relative rounded-2xl border border-white/10 bg-black/45 px-3 py-2.5 backdrop-blur-xl transition-colors hover:border-pulse/40 active:border-pulse/40"
            >
              <span className="text-sm leading-none">◉</span>
              {transmissions.length + following.length + savedPosts.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 font-mono text-[9px] font-semibold text-black">
                  {transmissions.length + following.length + savedPosts.length}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => setNovaOpen(true)}
            aria-label={`${supernovas.length} supernovae`}
            className="tap relative flex items-center gap-2 rounded-2xl border border-nova/40 bg-black/45 px-3 py-2.5 backdrop-blur-xl transition-all hover:border-nova hover:bg-nova/10 active:border-nova"
          >
            <motion.span
              animate={{ scale: supernovas.length ? [1, 1.25, 1] : 1 }}
              transition={{ duration: 2, repeat: Infinity }}
              className="h-2 w-2 rounded-full bg-nova"
              style={{ boxShadow: '0 0 10px rgba(255,255,255,.95)' }}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-nova">
              {supernovas.length} nova
            </span>
          </button>

          <button
            onClick={() => {
              const next = !muted
              setMuted(next)
              setMute(next)
              if (!next) resumeAudio()
            }}
            aria-label={muted ? 'unmute' : 'mute'}
            className="tap rounded-2xl border border-white/10 bg-black/45 px-3 py-2.5 backdrop-blur-xl transition-colors hover:border-glow/40 active:border-glow/40"
          >
            {muted ? '🔇' : '🔊'}
          </button>

          {/* phone-only: everything the desktop HUD shows inline lives in here */}
          {currentUser && (
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="open navigator"
              className="tap rounded-2xl border border-white/10 bg-black/45 px-3 py-2.5 backdrop-blur-xl transition-colors active:border-pulse/40 sm:hidden"
            >
              ☰
            </button>
          )}
        </div>
      </header>

      {/* ---------- hover tooltip (desktop only — touch has no hover) ---------- */}
      <AnimatePresence>
        {hoveredUser && !selected && !isMobile && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/60 px-4 py-2.5 text-center backdrop-blur-xl"
          >
            <div className="font-display text-[13px] text-white">{hoveredUser.name}</div>
            <div className="font-mono text-[10px] text-white/45">
              @{hoveredUser.handle} · click to enter orbit
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- bottom: minimap + leaders (desktop) ---------- */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-20 hidden items-end gap-3 p-5 sm:flex">
        <div className="pointer-events-auto">
          <MiniMap
            planets={minimap}
            cam={handleRef.current?.engine?.cam ?? { x: 0, y: 0, zoom: 1 }}
            meId={currentUser?.id ?? null}
            onJump={goTo}
          />
        </div>

        <div className="pointer-events-auto hidden flex-col gap-1.5 md:flex">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">brightest planets</div>
          {leaders.map((l) => {
            const u = userById(l.id)
            if (!u) return null
            return (
              <button
                key={l.id}
                onClick={() => goTo(l.id)}
                onMouseEnter={() => sfx.hover()}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/40 px-2.5 py-1.5 backdrop-blur-xl transition-all hover:border-pulse/40 hover:bg-black/60"
              >
                <PlanetBadge seed={u.seed} size={20} />
                <span className="font-mono text-[10px] text-white/60">@{u.handle}</span>
                <span className="ml-auto font-mono text-[9px] text-white/25">⚡{Math.round(l.activity)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ---------- phone toolbar: the core verbs, thumb-reachable ---------- */}
      {currentUser && (
        <div aria-label="quick actions" className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-2 px-3 pb-safe sm:hidden">
          <div className="pointer-events-auto mb-3 flex w-full max-w-sm items-stretch gap-2 rounded-2xl border border-white/10 bg-black/60 p-2 backdrop-blur-xl">
            <button
              onClick={() => goTo(currentUser.id)}
              className="tap flex flex-1 flex-col items-center justify-center rounded-xl py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/55 transition-colors active:bg-white/10 active:text-white"
            >
              <span className="text-base leading-none">◉</span>
              <span className="mt-1">my orbit</span>
            </button>
            <button
              onClick={() => {
                sfx.launch()
                const others = layouts.filter((l) => l.id !== currentUser.id)
                const pick = others[Math.floor(Math.random() * others.length)]
                if (pick) visit(pick.id)
              }}
              className="tap flex flex-1 flex-col items-center justify-center rounded-xl py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/55 transition-colors active:bg-white/10 active:text-white"
            >
              <span className="text-base leading-none">⇢</span>
              <span className="mt-1">fly</span>
            </button>
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={() => setComposerOpen(true)}
              className="tap flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-glow via-pulse to-nova px-3 font-display text-[11px] font-bold tracking-wider text-black transition-all active:scale-95"
              style={{ boxShadow: '0 0 28px rgba(255,255,255,.28)' }}
            >
              + SATELLITE
            </motion.button>
          </div>
        </div>
      )}

      {/* ---------- flight console (desktop) ---------- */}
      <div className="pointer-events-none absolute bottom-5 right-5 z-20 hidden flex-col items-end gap-2 sm:flex">
        <AnimatePresence>
          {currentUser && (
            <motion.button
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={() => setComposerOpen(true)}
              onMouseEnter={() => sfx.hover()}
              className="pointer-events-auto rounded-full bg-gradient-to-r from-glow via-pulse to-nova px-5 py-3.5 font-display text-xs font-bold tracking-wider text-black transition-all hover:brightness-110 active:scale-95"
              style={{ boxShadow: '0 0 40px rgba(255,255,255,.3)' }}
            >
              + SATELLITE
            </motion.button>
          )}
        </AnimatePresence>
        <button
          onClick={() => {
            sfx.launch()
            const others = layouts.filter((l) => l.id !== currentUser?.id)
            const pick = others[Math.floor(Math.random() * others.length)]
            if (pick) visit(pick.id)
          }}
          className="pointer-events-auto rounded-full border border-white/12 bg-black/50 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/60 backdrop-blur-xl transition-colors hover:border-glow/50 hover:text-white"
        >
          ⇢ fly somewhere random
        </button>
      </div>

      {/* ---------- stats ---------- */}
      <div className="pointer-events-none absolute right-3 top-20 z-10 hidden flex-col items-end gap-1 font-mono text-[9px] text-white/25 sm:flex sm:right-5 sm:top-24">
        <span>{stats.fps} FPS</span>
        <span>
          {stats.visible}/{stats.total} planets rendered
        </span>
        <span>drag · scroll · click · WASD</span>
      </div>

      {/* ---------- link indicator: are we in the shared galaxy or offline? ---------- */}
      <div className="pointer-events-none absolute left-3 top-20 z-10 hidden font-mono text-[9px] uppercase tracking-[0.16em] sm:block sm:left-5 sm:top-24">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 ${
            mode === 'supabase'
              ? linkStatus === 'online'
                ? 'border-white/15 text-white/45'
                : linkStatus === 'error'
                  ? 'border-nova/50 text-nova/80'
                  : 'border-white/10 text-white/35'
              : 'border-white/10 text-white/30'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              busy ? 'animate-pulse bg-white/70' : mode === 'supabase' && linkStatus === 'online' ? 'bg-white' : 'bg-white/35'
            }`}
          />
          {mode === 'supabase'
            ? linkStatus === 'online'
              ? 'shared galaxy'
              : linkStatus === 'error'
                ? 'link unstable'
                : 'linking…'
            : 'offline demo'}
        </span>
      </div>

      {/* ---------- panels ---------- */}
      <OrbitView userId={selected} onClose={closeIfSettled} onCompose={() => setComposerOpen(true)} />
      <Composer open={composerOpen} onClose={() => setComposerOpen(false)} />
      <SupernovaFeed open={novaOpen} onClose={() => setNovaOpen(false)} onVisit={goTo} />
      <SignalsConsole
        open={consoleOpen}
        onClose={() => setConsoleOpen(false)}
        initialTab={consoleTab}
        onVisit={goTo}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onVisit={goTo}
        onCompose={() => setComposerOpen(true)}
        onConsole={() => openConsole('transmissions')}
        onNova={() => setNovaOpen(true)}
        onRandom={flyRandom}
      />
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        planets={minimap}
        cam={handleRef.current?.engine?.cam ?? { x: 0, y: 0, zoom: 1 }}
        leaders={leaders}
        onJump={goTo}
        onConsole={(tab) => {
          setMenuOpen(false)
          openConsole(tab)
        }}
        onSearch={() => {
          setMenuOpen(false)
          setPaletteOpen(true)
        }}
        onAccount={() => {
          setMenuOpen(false)
          setSettingsOpen(true)
        }}
      />
      <AccountSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
      <Onboarding
        open={onboarding}
        onDone={() => {
          localStorage.setItem('orbit.onboarded', '1')
          setOnboarding(false)
        }}
      />

      {/* ---------- settings footer ---------- */}
      {currentUser && (
        <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-white/20 sm:flex">
          <div className="flex gap-3">
            <button onClick={() => setSettingsOpen(true)} className="transition-colors hover:text-white/60">
              account
            </button>
            <span>·</span>
            <button onClick={logout} className="transition-colors hover:text-white/60">
              leave orbit
            </button>
            <span>·</span>
            <button
              onClick={() => {
                if (confirm('Reset the galaxy to its seeded state? Your local posts will be lost.')) resetGalaxy()
              }}
              className="transition-colors hover:text-white/60"
            >
              reset galaxy
            </button>
          </div>
          <LinkEmailInline />
        </div>
      )}
    </div>
  )
}

function Shell() {
  const { currentUser, mode, ready, recovering } = useGalaxy()
  const [ambientReady, setAmbientReady] = useState(false)

  useEffect(() => {
    const go = () => {
      resumeAudio()
      startAmbient()
      setAmbientReady(true)
    }
    window.addEventListener('pointerdown', go, { once: true })
    return () => window.removeEventListener('pointerdown', go)
  }, [])

  // first paint while the galaxy is still loading from Supabase
  if (!ready && !currentUser) {
    return (
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-void text-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,.07), transparent 60%)',
          }}
        />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
          className="h-12 w-12 rounded-full border border-white/15 border-t-white/80"
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/40">
          {mode === 'supabase' ? 'linking to the shared galaxy' : 'forming the galaxy'}
        </p>
      </div>
    )
  }

  return (
    <div className="relative min-h-[100dvh] bg-void">
      {/* Auth background cosmos (CSS-only, cheap) */}
      {!currentUser && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 20% 20%, rgba(255,255,255,.09), transparent 55%), radial-gradient(ellipse at 80% 70%, rgba(255,255,255,.06), transparent 55%), radial-gradient(ellipse at 50% 110%, rgba(255,255,255,.07), transparent 60%)',
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'radial-gradient(1px 1px at 20px 30px, #fff, transparent), radial-gradient(1px 1px at 130px 80px, #e8e8e8, transparent), radial-gradient(1px 1px at 260px 40px, #fff, transparent), radial-gradient(1.5px 1.5px at 90px 200px, #d4d4d4, transparent), radial-gradient(1px 1px at 320px 260px, #fff, transparent), radial-gradient(1px 1px at 180px 340px, #fff, transparent)',
              backgroundSize: '400px 400px',
              animation: 'drift 14s ease-in-out infinite',
            }}
          />
        </div>
      )}
      {currentUser ? <Orbit /> : <AuthGate />}
      {recovering && currentUser && (
        // The recovery link signed us in, but the new key has to be chosen
        // before the galaxy is usable.
        <div className="fixed inset-0 z-[80] bg-void">
          <AuthGate />
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <GalaxyProvider>
      <Shell />
    </GalaxyProvider>
  )
}
