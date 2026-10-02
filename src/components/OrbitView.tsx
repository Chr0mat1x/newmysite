import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useGalaxy } from '../state/store'
import { PlanetBadge } from './PlanetBadge'
import { PostCard } from './PostCard'
import { sfx } from '../lib/audio'
import { useIsMobile } from '../lib/useMedia'

interface Props {
  userId: string | null
  onClose: () => void
  onCompose: () => void
  onMessage: (userId: string) => void
}

export function OrbitView({ userId, onClose, onCompose, onMessage }: Props) {
  const { userById, postsOf, currentUser, updateProfile, toggleLike, toggleFollow, state } = useGalaxy()
  const user = userId ? userById(userId) : null
  const isMobile = useIsMobile()
  const posts = useMemo(() => (userId ? postsOf(userId) : []), [userId, postsOf, state.posts])
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftBio, setDraftBio] = useState('')

  const stats = useMemo(() => {
    const likes = posts.reduce((a, p) => a + p.likes.length, 0)
    const signals = posts.reduce((a, p) => a + p.signals.length, 0)
    return { likes, signals, nova: posts.filter((p) => p.supernovaAt).length }
  }, [posts])

  const isMe = !!(currentUser && userId === currentUser.id)
  const isFollowing = !!currentUser?.following?.includes(userId ?? '')

  if (!user) return null

  const startEditing = () => {
    setDraftName(user.name)
    setDraftBio(user.bio)
    setEditing(true)
  }
  const saveEditing = () => {
    const name = draftName.trim().slice(0, 40)
    updateProfile({ name: name || user.name, bio: draftBio.trim().slice(0, 160) })
    setEditing(false)
    sfx.click()
  }

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
            className="fixed inset-0 z-30 bg-black/55 lg:bg-gradient-to-r lg:from-black/20 lg:to-black/70"
          />
          <motion.aside
            key="panel"
            initial={isMobile ? { y: '100%', opacity: 0.6 } : { x: '105%', opacity: 0.4 }}
            animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
            exit={isMobile ? { y: '100%', opacity: 0.4 } : { x: '105%', opacity: 0.2 }}
            transition={{ duration: isMobile ? 0.42 : 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-40 flex flex-col border-white/10 bg-abyss/88 backdrop-blur-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[88dvh] max-sm:rounded-t-3xl max-sm:border-t sm:bottom-0 sm:right-0 sm:top-0 sm:w-[440px] sm:border-l lg:w-[470px]"
            style={{ boxShadow: '-40px 0 120px rgba(0,0,0,.7)' }}
          >
            {/* grab handle — phone only, dragging down dismisses the sheet */}
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.35 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 500) onClose()
              }}
              className="flex shrink-0 cursor-grab justify-center pb-1 pt-3 active:cursor-grabbing sm:hidden"
            >
              <div className="h-1 w-10 rounded-full bg-white/25" />
            </motion.div>

            {/* glowing top edge */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-50"
              style={{ background: `radial-gradient(ellipse at 50% -30%, rgba(255,255,255,.10), transparent 70%)` }}
            />

            <header className="relative shrink-0 border-b border-white/[0.07] px-5 pb-5 pt-4 sm:pt-6">
              <button
                onClick={() => {
                  sfx.click()
                  onClose()
                }}
                aria-label="close orbit"
                className="tap absolute right-3 top-3 rounded-lg px-3 text-white/40 transition-colors hover:bg-white/5 hover:text-white active:bg-white/5 active:text-white"
              >
                ✕
              </button>

              <div className="flex items-center gap-4">
                <motion.div
                  animate={{ y: [0, -5, 0], rotate: [0, 4, 0] }}
                  transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                  className="shrink-0"
                >
                  <PlanetBadge seed={user.seed} size={72} />
                </motion.div>
                <div className="min-w-0 flex-1 pr-8">
                  {editing ? (
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      maxLength={40}
                      autoFocus
                      aria-label="planet name"
                      className="input !py-2 !text-base"
                    />
                  ) : (
                    <h2 className="truncate font-display text-xl font-semibold text-white">{user.name}</h2>
                  )}
                  <div className="truncate font-mono text-[11px] text-white/45">
                    @{user.handle}
                    {isFollowing && <span className="ml-2 text-white/70">· following</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-white/50">
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

              {editing ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={draftBio}
                    onChange={(e) => setDraftBio(e.target.value)}
                    maxLength={160}
                    rows={2}
                    aria-label="planet bio"
                    placeholder="transmit a short bio…"
                    className="input resize-none !py-2 !text-[13px]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveEditing}
                      className="tap flex-1 rounded-xl bg-gradient-to-r from-pulse to-glow py-2 font-display text-xs font-semibold text-black active:scale-[0.98]"
                    >
                      save
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="tap rounded-xl border border-white/12 px-4 py-2 font-mono text-[11px] text-white/60 hover:text-white active:bg-white/5"
                    >
                      cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-3 text-[13px] leading-relaxed text-white/60">
                    {user.bio || 'No bio transmitted.'}
                  </p>
                  {isMe && (
                    <button
                      onClick={startEditing}
                      className="tap mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35 transition-colors hover:text-white/70"
                    >
                      ✎ edit profile
                    </button>
                  )}
                </>
              )}

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
                    className="tap flex-1 rounded-xl bg-gradient-to-r from-pulse to-glow py-2.5 font-display text-xs font-semibold tracking-wide text-black transition-all hover:brightness-110 active:scale-[0.98]"
                  >
                    + LAUNCH A SATELLITE
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => toggleFollow(user.id)}
                      aria-pressed={isFollowing}
                      className={`tap flex-1 rounded-xl border py-2.5 font-display text-xs font-semibold tracking-wide transition-all active:scale-[0.98] ${
                        isFollowing
                          ? 'border-white/30 bg-white/10 text-white'
                          : 'border-white/12 bg-white/[0.04] text-white/80 hover:border-pulse/50 hover:text-white'
                      }`}
                    >
                      {isFollowing ? '✦ FOLLOWING' : '+ FOLLOW'}
                    </button>
                    <button
                      onClick={() => {
                        sfx.signal()
                        if (posts[0]) toggleLike(posts[0].id)
                      }}
                      disabled={!posts[0]}
                      className="tap flex-1 rounded-xl border border-white/12 bg-white/[0.04] py-2.5 font-display text-xs font-semibold tracking-wide text-white/80 transition-all hover:border-nova/50 hover:text-white active:bg-white/[0.08] disabled:opacity-30"
                    >
                      ★ STAR LATEST
                    </button>
                  </>
                )}
              </div>

              {/* private message — only for planets that can actually answer */}
              {!isMe && !user.mock && (
                <button
                  onClick={() => {
                    sfx.click()
                    onMessage(user.id)
                  }}
                  className="tap mt-2 w-full rounded-xl border border-white/12 bg-white/[0.04] py-2.5 font-display text-xs font-semibold tracking-wide text-white/80 transition-all hover:border-glow/50 hover:text-white active:scale-[0.98]"
                >
                  ✉ SEND A PRIVATE TRANSMISSION
                </button>
              )}

              {isMe && (
                <button
                  onClick={() => updateProfile({ seed: (user.seed ^ 0x9e3779b9) >>> 0 })}
                  className="tap mt-2 w-full rounded-xl border border-white/[0.07] py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/80 active:bg-white/5"
                >
                  ⟳ remix my planet
                </button>
              )}
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
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
                      className="tap mt-4 rounded-xl bg-gradient-to-r from-pulse to-glow px-4 py-2 text-xs font-semibold text-black active:scale-95"
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
