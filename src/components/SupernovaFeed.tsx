import { AnimatePresence, motion } from 'framer-motion'
import { useGalaxy } from '../state/store'
import { PlanetBadge } from './PlanetBadge'
import { PostCard } from './PostCard'
import { sfx } from '../lib/audio'
import { useIsMobile } from '../lib/useMedia'

export function SupernovaFeed({ open, onClose, onVisit }: { open: boolean; onClose: () => void; onVisit: (id: string) => void }) {
  const { supernovas, userById } = useGalaxy()
  const isMobile = useIsMobile()

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-md"
          />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
            <motion.div
              initial={isMobile ? { y: '100%', opacity: 0.7 } : { opacity: 0, y: 30, scale: 0.98 }}
              animate={isMobile ? { y: 0, opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={isMobile ? { y: '100%', opacity: 0.5 } : { opacity: 0, y: 20, scale: 0.99 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-nova/30 bg-abyss/95 backdrop-blur-2xl sm:w-[min(680px,94vw)] sm:rounded-3xl"
              style={{ boxShadow: '0 0 140px rgba(255,255,255,.10)' }}
            >
              <motion.div
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.35 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 90 || info.velocity.y > 500) onClose()
                }}
                className="flex shrink-0 justify-center pb-1 pt-3 sm:hidden"
              >
                <div className="h-1 w-10 rounded-full bg-white/25" />
              </motion.div>

              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-48"
                style={{ background: 'radial-gradient(ellipse at 50% -40%, rgba(255,255,255,.10), transparent 70%)' }}
              />
              <header className="relative flex shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <h3 className="font-display text-lg font-semibold tracking-wide text-white">
                  Supernovae
                </h3>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-nova/80">
                  posts burning across the whole galaxy · 24h
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="close supernovae"
                className="tap rounded-lg px-3 text-white/40 hover:bg-white/5 hover:text-white active:bg-white/5 active:text-white"
              >
                ✕
              </button>
            </header>

            <div className="relative flex-1 space-y-3 overflow-y-auto overscroll-contain p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:pb-5">
              {supernovas.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="mb-4 h-16 w-16 rounded-full bg-gradient-to-br from-nova to-pulse blur-sm"
                  />
                  <p className="font-display text-sm text-white/60">Nothing is burning right now.</p>
                  <p className="mt-1 max-w-xs font-mono text-[10px] uppercase tracking-widest text-white/30">
                    give a post 10 stars and watch it detonate
                  </p>
                </div>
              )}
              {supernovas.map((p, i) => {
                const a = userById(p.authorId)
                if (!a) return null
                return (
                  <div key={p.id} className="space-y-1.5">
                    <button
                      onClick={() => {
                        sfx.launch()
                        onClose()
                        onVisit(a.id)
                      }}
                      className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white/80"
                    >
                      <PlanetBadge seed={a.seed} size={18} />
                      visit @{a.handle}'s orbit →
                    </button>
                    <PostCard post={p} index={i} />
                  </div>
                )
              })}
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
