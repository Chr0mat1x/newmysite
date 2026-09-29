import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useGalaxy } from '../state/store'
import { PlanetBadge } from './PlanetBadge'
import { sfx } from '../lib/audio'
import { timeAgo } from '../lib/math'
import { useIsMobile } from '../lib/useMedia'
import type { Post, Signal, User } from '../types'

type Tab = 'transmissions' | 'constellation' | 'cargo'

interface Props {
  open: boolean
  onClose: () => void
  initialTab?: Tab
  onVisit: (userId: string) => void
}

export function SignalsConsole({ open, onClose, initialTab = 'transmissions', onVisit }: Props) {
  const { transmissions, following, savedPosts, currentUser, toggleFollow, userById } = useGalaxy()
  const [tab, setTab] = useState<Tab>(initialTab)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  const counts: Record<Tab, number> = {
    transmissions: transmissions.length,
    constellation: following.length,
    cargo: savedPosts.length,
  }

  return (
    <AnimatePresence>
      {open && currentUser && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/55"
          />
          <motion.aside
            initial={isMobile ? { y: '100%', opacity: 0.6 } : { x: '-105%', opacity: 0.4 }}
            animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
            exit={isMobile ? { y: '100%', opacity: 0.4 } : { x: '-105%', opacity: 0.2 }}
            transition={{ duration: isMobile ? 0.42 : 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-50 flex flex-col border-white/10 bg-abyss/90 backdrop-blur-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[88dvh] max-sm:rounded-t-3xl max-sm:border-t sm:bottom-0 sm:left-0 sm:top-0 sm:w-[400px] sm:border-r"
            style={{ boxShadow: '40px 0 120px rgba(0,0,0,.7)' }}
            aria-label="signals console"
          >
            <div className="flex shrink-0 justify-center pb-1 pt-3 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-white/25" />
            </div>

            <header className="relative shrink-0 border-b border-white/[0.07] px-5 pb-4 pt-4 sm:pt-6">
              <button
                onClick={onClose}
                aria-label="close console"
                className="tap absolute right-3 top-3 rounded-lg px-3 py-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white active:bg-white/5"
              >
                ✕
              </button>
              <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-white/35">signals console</div>
              <h2 className="mt-1 font-display text-lg font-semibold text-white">@{currentUser.handle}</h2>

              <div className="mt-3 flex gap-1.5">
                {(['transmissions', 'constellation', 'cargo'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      sfx.click()
                      setTab(t)
                    }}
                    className={`tap flex-1 rounded-xl border px-2 py-2 font-mono text-[9px] uppercase tracking-[0.12em] transition-all ${
                      tab === t
                        ? 'border-white/25 bg-white/10 text-white'
                        : 'border-white/[0.07] text-white/45 hover:text-white/80'
                    }`}
                  >
                    {t}
                    <span className="ml-1 text-white/40">{counts[t]}</span>
                  </button>
                ))}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {tab === 'transmissions' && <Transmissions items={transmissions} onVisit={onVisit} />}
              {tab === 'constellation' && <Constellation users={following} onVisit={onVisit} />}
              {tab === 'cargo' && <Cargo posts={savedPosts} onVisit={onVisit} userById={userById} />}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function Empty({ glyph, title, sub }: { glyph: string; title: string; sub: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
      <div className="font-mono text-3xl text-white/20">{glyph}</div>
      <p className="mt-4 font-display text-sm text-white/60">{title}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-white/30">{sub}</p>
    </div>
  )
}

function Transmissions({
  items,
  onVisit,
}: {
  items: { signal: Signal; post: Post; user: User }[]
  onVisit: (id: string) => void
}) {
  if (items.length === 0)
    return <Empty glyph="◎" title="No signals received yet." sub="someone needs to reply to your satellites" />
  return (
    <div className="space-y-2.5">
      {items.map(({ signal, post, user }) => (
        <button
          key={signal.id}
          onClick={() => {
            sfx.click()
            onVisit(user.id)
          }}
          className="tap flex w-full items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition-colors hover:border-pulse/30 active:bg-white/[0.05]"
        >
          <PlanetBadge seed={user.seed} size={30} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-display text-[12px] text-white/90">{user.name}</span>
              <span className="shrink-0 font-mono text-[9px] text-white/35">@{user.handle}</span>
              <span className="ml-auto shrink-0 font-mono text-[9px] text-white/25">{timeAgo(signal.createdAt)}</span>
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-white/80">{signal.text}</p>
            <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-wider text-white/30">
              on your satellite: {post.text.replace(/\s+/g, ' ').slice(0, 40) || 'image'}
            </p>
          </div>
        </button>
      ))}
    </div>
  )
}

function Constellation({ users, onVisit }: { users: User[]; onVisit: (id: string) => void }) {
  const { toggleFollow } = useGalaxy()
  if (users.length === 0)
    return <Empty glyph="✦" title="Your constellation is empty." sub="follow planets to keep them close" />
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <div
          key={u.id}
          className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3"
        >
          <button onClick={() => onVisit(u.id)} className="tap flex min-w-0 flex-1 items-center gap-3 text-left">
            <PlanetBadge seed={u.seed} size={32} />
            <div className="min-w-0">
              <div className="truncate font-display text-[12px] text-white/90">{u.name}</div>
              <div className="truncate font-mono text-[9px] text-white/35">@{u.handle}</div>
            </div>
          </button>
          <button
            onClick={() => toggleFollow(u.id)}
            aria-label={`unfollow ${u.handle}`}
            className="tap shrink-0 rounded-lg border border-white/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-white/45 transition-colors hover:border-red-300/40 hover:text-red-200/80 active:bg-white/5"
          >
            unfollow
          </button>
        </div>
      ))}
    </div>
  )
}

function Cargo({
  posts,
  onVisit,
  userById,
}: {
  posts: Post[]
  onVisit: (id: string) => void
  userById: (id: string) => User | undefined
}) {
  if (posts.length === 0)
    return <Empty glyph="⬡" title="Cargo hold is empty." sub="bookmark satellites to collect them here" />
  return (
    <div className="space-y-2">
      {posts.map((p) => {
        const u = userById(p.authorId)
        return (
          <button
            key={p.id}
            onClick={() => {
              sfx.click()
              onVisit(p.authorId)
            }}
            className="tap flex w-full items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition-colors hover:border-pulse/30 active:bg-white/[0.05]"
          >
            {p.image ? (
              <img
                src={p.image}
                alt=""
                referrerPolicy="no-referrer"
                className="h-10 w-10 shrink-0 rounded-lg border border-white/10 object-cover grayscale"
              />
            ) : (
              u && <PlanetBadge seed={u.seed} size={30} />
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] leading-snug text-white/85">
                {p.text || 'image satellite'}
              </p>
              <p className="mt-1 font-mono text-[9px] text-white/35">
                @{u?.handle ?? 'unknown'} · ★{p.likes.length}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
