import { AnimatePresence, motion } from 'framer-motion'
import { useMemo } from 'react'
import { useGalaxy } from '../state/store'
import { PlanetBadge } from './PlanetBadge'
import { PostCard } from './PostCard'
import { sfx } from '../lib/audio'

interface Props {
  userId: string | null
  onClose: () => void
  onCompose: () => void
}

export function OrbitView({ userId, onClose, onCompose }: Props) {
  const { userById, postsOf, currentUser, updateProfile, toggleLike, state } = useGalaxy()
  const user = userId ? userById(userId) : null
  const posts = useMemo(() => (userId ? postsOf(userId) : []), [userId, postsOf, state.posts])

  const stats = useMemo(() => {
    const likes = posts.reduce((a, p) => a + p.likes.length, 0)
    const signals = posts.reduce((a, p) => a + p.signals.length, 0)
    return { likes, signals, nova: posts.filter((p) => p.supernovaAt).length }
  }, [posts])

  const isMe = !!(currentUser && userId === currentUser.id)
  const isFollowed = false

  return (
    <AnimatePresence>
      {user && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-30 bg-gradient-to-r from-black/20 to-black/70 lg:hidden"
          />
          <motion.aside
            key="panel"
            initial={{ x: '105%', opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '105%', opacity: 0.2 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-0 right-0 top-0 z-40 flex w-full flex-col border-l border-white/10 bg-abyss/88 backdrop-blur-2xl sm:w-[440px] lg:w-[470px]"
            style={{ boxShadow: '-40px 0 120px rgba(0,0,0,.7)' }}
          >
            {/* glowing top edge */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-50"
              style={{ background: `radial-gradient(ellipse at 50% -30%, rgba(255,255,255,.10), transparent 70%)` }}
            />

            <header className="relative border-b border-white/[0.07] px-5 pb-5 pt-6">
              <button
                onClick={() => {
                  sfx.click()
                  onClose()
                }}
                className="absolute right-4 top-4 rounded-lg px-2 py-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
              >
                ✕
              </button>

              <div className="flex items-center gap-4">
                <motion.div
                  animate={{ y: [0, -5, 0], rotate: [0, 4, 0] }}
                  transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <PlanetBadge seed={user.seed} size={78} />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-xl font-semibold text-white">{user.name}</h2>
                  <div className="font-mono text-[11px] text-white/45">@{user.handle}</div>
                  <div className="mt-2 flex gap-3 font-mono text-[10px] text-white/50">
                    <span>
                      <b className="text-white/85">{posts.length}</b> satellites
                    </span>
                    <span>
                      <b className="text-white/85">{stats.likes}</b> stars
                    </span>
                    <span>
                      <b className="text-white/85">{stats.signals}</b> signals
                    </span>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[13px] leading-relaxed text-white/60">{user.bio}</p>

              {/* orbit density visualisation */}
              <div className="relative mt-4 h-[74px] overflow-hidden rounded-2xl border border-white/[0.07] bg-black/30">
                <svg viewBox="0 0 400 74" className="h-full w-full" preserveAspectRatio="none">
                  <defs>
                    <radialGradient id={`pg-${user.id}`}>
                      <stop offset="0%" stopColor="#f5f5f5" />
                      <stop offset="100%" stopColor="#5a5a5a" />
                    </radialGradient>
                  </defs>
                  <circle cx="200" cy="37" r="13" fill={`url(#pg-${user.id})`} />
                  {[26, 40, 54].map((r, i) => (
                    <ellipse
                      key={r}
                      cx="200"
                      cy="37"
                      rx={r}
                      ry={r * 0.34}
                      fill="none"
                      stroke={`rgba(255,255,255,${0.28 - i * 0.06})`}
                      strokeWidth="1"
                    />
                  ))}
                  {posts.slice(0, 10).map((p, i) => {
                    const r = 26 + (i % 3) * 14
                    const a = (i / 10) * Math.PI * 2 + i
                    return (
                      <circle
                        key={p.id}
                        cx={200 + Math.cos(a) * r}
                        cy={37 + Math.sin(a) * r * 0.34}
                        r={p.supernovaAt ? 2.6 : 1.8}
                        fill={p.supernovaAt ? '#ffffff' : '#cfcfcf'}
                        opacity={0.9}
                      />
                    )
                  })}
                </svg>
              </div>

              <div className="mt-4 flex gap-2">
                {isMe ? (
                  <button
                    onClick={onCompose}
                    className="flex-1 rounded-xl bg-gradient-to-r from-pulse to-glow py-2.5 font-display text-xs font-semibold tracking-wide text-black transition-all hover:brightness-110"
                  >
                    + LAUNCH A SATELLITE
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        sfx.signal()
                        if (posts[0]) toggleLike(posts[0].id)
                      }}
                      disabled={!posts[0] || isFollowed}
                      className="flex-1 rounded-xl border border-white/12 bg-white/[0.04] py-2.5 font-display text-xs font-semibold tracking-wide text-white/80 transition-all hover:border-nova/50 hover:text-white disabled:opacity-30"
                    >
                      ★ STAR THEIR LATEST
                    </button>
                    <button
                      onClick={() => {
                        sfx.click()
                        onClose()
                      }}
                      className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 font-mono text-[11px] text-white/60 hover:text-white"
                    >
                      return
                    </button>
                  </>
                )}
              </div>

              {isMe && (
                <button
                  onClick={() => updateProfile({ seed: (user.seed ^ 0x9e3779b9) >>> 0 })}
                  className="mt-2 w-full rounded-xl border border-white/[0.07] py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/80"
                >
                  ⟳ remix my planet
                </button>
              )}
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {posts.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <PlanetBadge seed={user.seed} size={90} />
                  <p className="mt-4 font-display text-sm text-white/60">This orbit is empty.</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-white/30">
                    no satellites in transit
                  </p>
                  {isMe && (
                    <button
                      onClick={onCompose}
                      className="mt-4 rounded-xl bg-gradient-to-r from-pulse to-glow px-4 py-2 text-xs font-semibold text-black"
                    >
                      launch your first satellite
                    </button>
                  )}
                </div>
              )}
              {posts.map((p, i) => (
                <PostCard key={p.id} post={p} index={i} />
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
