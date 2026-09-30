import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { PlanetBadge } from './PlanetBadge'
import { MiniMap, type MiniPlanet, MINI_WORLD } from './MiniMap'
import { useGalaxy } from '../state/store'
import { sfx } from '../lib/audio'
import { LinkEmailInline } from './LinkEmailInline'

export interface Leader {
  id: string
  activity: number
}

/**
 * Mobile-only bottom sheet holding everything the desktop HUD shows inline:
 * the mini-map, the brightest-planet leaderboard, and the account actions that
 * would otherwise be unreachable on a phone.
 */
export function MobileMenu({
  open,
  onClose,
  planets,
  cam,
  leaders,
  onJump,
  onConsole,
  onSearch,
  onAccount,
}: {
  open: boolean
  onClose: () => void
  planets: MiniPlanet[]
  cam: { x: number; y: number; zoom: number }
  leaders: Leader[]
  onJump: (id: string) => void
  onConsole: (tab: 'transmissions' | 'constellation' | 'cargo') => void
  onSearch: () => void
  onAccount: () => void
}) {
  const { currentUser, userById, logout, resetGalaxy, transmissions, following, savedPosts } = useGalaxy()
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 500) onClose()
            }}
            className="fixed inset-x-0 bottom-0 z-[66] max-h-[82dvh] overflow-hidden rounded-t-3xl border-t border-white/12 bg-abyss/95 backdrop-blur-2xl"
          >
            {/* grab handle */}
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1 w-10 rounded-full bg-white/25" />
            </div>

            <div className="max-h-[calc(82dvh-2.5rem)] space-y-5 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold tracking-wide text-white">Navigator</h3>
                <button
                  onClick={onClose}
                  className="tap rounded-lg px-3 text-white/45 transition-colors active:bg-white/5 active:text-white"
                >
                  ✕
                </button>
              </div>

              {currentUser && (
                <div className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <PlanetBadge seed={currentUser.seed} size={38} />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/90">{currentUser.name}</div>
                    <div className="truncate font-mono text-[10px] text-white/40">@{currentUser.handle}</div>
                    <LinkEmailInline compact />
                  </div>
                  <button
                    onClick={() => {
                      sfx.click()
                      onJump(currentUser.id)
                      onClose()
                    }}
                    className="tap ml-auto rounded-lg px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 transition-colors active:bg-white/5 active:text-white"
                  >
                    my orbit
                  </button>
                </div>
              )}

              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">signals</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      sfx.click()
                      onConsole('transmissions')
                    }}
                    className="tap flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 active:bg-white/[0.06]"
                  >
                    transmissions
                    <span className="text-white/35">{transmissions.length}</span>
                  </button>
                  <button
                    onClick={() => {
                      sfx.click()
                      onConsole('constellation')
                    }}
                    className="tap flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 active:bg-white/[0.06]"
                  >
                    constellation
                    <span className="text-white/35">{following.length}</span>
                  </button>
                  <button
                    onClick={() => {
                      sfx.click()
                      onConsole('cargo')
                    }}
                    className="tap flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 active:bg-white/[0.06]"
                  >
                    cargo
                    <span className="text-white/35">{savedPosts.length}</span>
                  </button>
                  <button
                    onClick={() => {
                      sfx.click()
                      onSearch()
                    }}
                    className="tap flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 active:bg-white/[0.06]"
                  >
                    search
                    <span className="text-white/35">⌕</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">galaxy map</div>
                <div className="flex justify-center">
                  <MiniMap
                    planets={planets}
                    cam={cam}
                    meId={currentUser?.id ?? null}
                    onJump={(id) => {
                      onJump(id)
                      onClose()
                    }}
                  />
                </div>
                <p className="mt-2 text-center font-mono text-[9px] text-white/25">
                  world spans ±{MINI_WORLD} · tap a node to travel
                </p>
              </div>

              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
                  brightest planets
                </div>
                <div className="space-y-1.5">
                  {leaders.map((l) => {
                    const u = userById(l.id)
                    if (!u) return null
                    return (
                      <button
                        key={l.id}
                        onClick={() => {
                          sfx.click()
                          onJump(l.id)
                          onClose()
                        }}
                        className="tap flex w-full items-center gap-2 rounded-xl border border-white/[0.07] bg-black/40 px-3 py-1.5 text-left transition-colors active:bg-black/60"
                      >
                        <PlanetBadge seed={u.seed} size={22} />
                        <span className="truncate font-mono text-[11px] text-white/65">@{u.handle}</span>
                        <span className="ml-auto font-mono text-[10px] text-white/30">⚡{Math.round(l.activity)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1 border-t border-white/[0.07] pt-4">
                <button
                  onClick={() => {
                    sfx.click()
                    onAccount()
                  }}
                  className="tap w-full rounded-xl border border-white/10 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white/55 transition-colors active:bg-white/5 active:text-white"
                >
                  account settings
                </button>
                <button
                  onClick={logout}
                  className="tap w-full rounded-xl border border-white/10 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white/55 transition-colors active:bg-white/5 active:text-white"
                >
                  leave orbit
                </button>
                {confirmReset ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        resetGalaxy()
                        setConfirmReset(false)
                        onClose()
                      }}
                      className="tap flex-1 rounded-xl border border-white/25 bg-white/10 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white"
                    >
                      confirm reset
                    </button>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="tap rounded-xl border border-white/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white/50"
                    >
                      cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="tap w-full rounded-xl border border-white/10 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white/55 transition-colors active:bg-white/5 active:text-white"
                  >
                    reset galaxy
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
