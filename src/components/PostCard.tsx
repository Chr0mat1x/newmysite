import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import type { Post } from '../types'
import { SUPERNOVA_TTL, SUPERNOVA_THRESHOLD } from '../types'
import { useGalaxy } from '../state/store'
import { PlanetBadge } from './PlanetBadge'
import { timeAgo } from '../lib/math'
import { sfx } from '../lib/audio'

export function PostCard({ post, index = 0 }: { post: Post; index?: number }) {
  const { currentUser, userById, toggleLike, addSignal, deletePost } = useGalaxy()
  const [showSignals, setShowSignals] = useState(false)
  const [draft, setDraft] = useState('')
  const [imgOk, setImgOk] = useState(true)

  const author = userById(post.authorId)
  if (!author) return null

  const liked = !!currentUser && post.likes.includes(currentUser.id)
  const nova = !!post.supernovaAt && Date.now() - post.supernovaAt < SUPERNOVA_TTL
  const progress = Math.min(1, post.likes.length / SUPERNOVA_THRESHOLD)
  const mine = currentUser?.id === post.authorId

  const submitSignal = () => {
    if (!draft.trim()) return
    addSignal(post.id, draft)
    setDraft('')
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4), duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="group relative overflow-hidden rounded-2xl border backdrop-blur-xl"
      style={{
        borderColor: nova ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.09)',
        background: nova
          ? 'linear-gradient(150deg, rgba(255,255,255,.10), rgba(8,8,8,.75))'
          : 'linear-gradient(150deg, rgba(255,255,255,.05), rgba(6,6,6,.66))',
        boxShadow: nova
          ? '0 0 60px rgba(255,255,255,.20), inset 0 1px 0 rgba(255,255,255,.10)'
          : '0 8px 40px rgba(0,0,0,.5)',
      }}
    >
      {nova && (
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background: 'radial-gradient(circle at 85% -10%, rgba(255,255,255,.14), transparent 60%)',
          }}
        />
      )}

      <div className="relative p-4 sm:p-5">
        <header className="mb-3 flex items-start gap-3">
          <PlanetBadge seed={author.seed} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-display text-sm font-medium text-white/95">{author.name}</span>
              {nova && (
                <span className="rounded-full border border-nova/50 bg-nova/15 px-2 py-[1px] font-mono text-[9px] font-semibold tracking-widest text-nova">
                  SUPERNOVA
                </span>
              )}
            </div>
            <div className="font-mono text-[10px] text-white/40">
              @{author.handle} · {timeAgo(post.createdAt)}
            </div>
          </div>
          {mine && (
            <button
              onClick={() => deletePost(post.id)}
              aria-label="eject post"
              className="tap shrink-0 rounded-lg px-2 py-1 font-mono text-[10px] text-white/30 transition-all hover:bg-white/5 hover:text-red-300/80 active:bg-white/5 active:text-red-300/80 sm:opacity-0 sm:group-hover:opacity-100"
            >
              eject
            </button>
          )}
        </header>

        {post.image && imgOk && (
          <div className="relative mb-3 overflow-hidden rounded-xl border border-white/10 bg-black/40">
            <img
              src={post.image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgOk(false)}
              className="max-h-[420px] w-full object-cover grayscale transition-transform duration-700 group-hover:scale-[1.02]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </div>
        )}

        {post.text && (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/82">{post.text}</p>
        )}

        {/* supernova charge meter */}
        {!nova && progress > 0 && (
          <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              animate={{ width: `${progress * 100}%` }}
              transition={{ type: 'spring', stiffness: 90, damping: 18 }}
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, #5a5a5a, #d4d4d4, #ffffff)',
                filter: 'blur(.3px)',
              }}
            />
          </div>
        )}

        <footer className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            onMouseEnter={() => sfx.hover()}
            onClick={() => toggleLike(post.id)}
            aria-label={liked ? 'remove star' : 'star this post'}
            className={`tap flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-all active:scale-95 ${
              liked
                ? 'border-nova/50 bg-nova/15 text-nova'
                : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-pulse/40 hover:text-white'
            }`}
          >
            <Star filled={liked} />
            <span className="font-mono">{post.likes.length}</span>
          </button>

          <button
            onClick={() => {
              sfx.hover()
              setShowSignals((s) => !s)
            }}
            aria-label="toggle signals"
            className="tap flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60 transition-all hover:border-glow/40 hover:text-white active:scale-95"
          >
            <SignalIcon />
            <span className="font-mono">{post.signals.length}</span>
          </button>

          <span className="font-mono text-[10px] text-white/25 max-sm:w-full max-sm:pt-0.5 sm:ml-auto">
            {nova
              ? `visible galaxy-wide · ${Math.max(1, Math.ceil((SUPERNOVA_TTL - (Date.now() - (post.supernovaAt ?? 0))) / 3600000))}h left`
              : `${Math.max(0, SUPERNOVA_THRESHOLD - post.likes.length)} to supernova`}
          </span>
        </footer>

        <AnimatePresence>
          {showSignals && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2 border-t border-white/[0.07] pt-3">
                {post.signals.length === 0 && (
                  <p className="font-mono text-[10px] uppercase tracking-widest text-white/25">
                    no signals yet — be the first satellite
                  </p>
                )}
                {post.signals.map((s) => {
                  const u = userById(s.authorId)
                  if (!u) return null
                  return (
                    <div key={s.id} className="flex items-start gap-2.5">
                      <PlanetBadge seed={u.seed} size={22} />
                      <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-white/[0.04] px-3 py-2">
                        <div className="font-mono text-[10px] text-white/40">@{u.handle}</div>
                        <div className="text-[13px] text-white/80">{s.text}</div>
                      </div>
                    </div>
                  )
                })}
                {currentUser && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitSignal()}
                      placeholder="send a signal into their orbit…"
                      className="input flex-1 !py-2 !text-[13px]"
                    />
                    <button
                      onClick={submitSignal}
                      disabled={!draft.trim()}
                      className="tap shrink-0 rounded-xl bg-gradient-to-r from-pulse to-glow px-3 py-2 text-xs font-semibold text-black active:scale-95 disabled:opacity-30"
                    >
                      Send
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  )
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M12 2l2.9 6.3 6.9.8-5 4.8 1.3 6.8L12 17.8 5.9 20.7 7.2 13.9l-5-4.8 6.9-.8z" strokeLinejoin="round" />
    </svg>
  )
}

function SignalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 12a8 8 0 0116 0" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M8 12a4 4 0 018 0" />
    </svg>
  )
}
