import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGalaxy } from '../state/store'
import { PlanetBadge } from './PlanetBadge'
import { sfx } from '../lib/audio'
import type { Post, User } from '../types'

/** One row of the palette: either a planet to fly to or an action to run. */
interface Entry {
  id: string
  kind: 'planet' | 'post' | 'action'
  label: string
  hint: string
  user?: User
  post?: Post
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  onVisit: (userId: string) => void
  onCompose: () => void
  onConsole: () => void
  onNova: () => void
  onRandom: () => void
  onMessenger: () => void
}

/** Tiny subsequence matcher — "nv" hits "Nova", "orb" hits "orbit". */
function fuzzy(needle: string, hay: string) {
  if (!needle) return 0
  const n = needle.toLowerCase()
  const h = hay.toLowerCase()
  let i = 0
  let score = 0
  let streak = 0
  for (let j = 0; j < h.length && i < n.length; j++) {
    if (h[j] === n[i]) {
      i++
      streak++
      score += 1 + streak * 2
      if (j === 0 || h[j - 1] === ' ') score += 6
    } else streak = 0
  }
  return i === n.length ? score - h.length * 0.05 : -1
}

export function CommandPalette({ open, onClose, onVisit, onCompose, onConsole, onNova, onRandom, onMessenger }: Props) {
  const { users, currentUser, state, userById } = useGalaxy()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      // focus after the enter animation starts so mobile keyboards behave
      const t = setTimeout(() => inputRef.current?.focus(), 40)
      return () => clearTimeout(t)
    }
  }, [open])

  const entries = useMemo<Entry[]>(() => {
    const actions: Entry[] = [
      {
        id: 'act:compose',
        kind: 'action',
        label: 'launch a new satellite',
        hint: 'new post',
        run: onCompose,
      },
      { id: 'act:me', kind: 'action', label: 'fly to my orbit', hint: 'home', run: () => currentUser && onVisit(currentUser.id) },
      { id: 'act:random', kind: 'action', label: 'fly somewhere random', hint: 'explore', run: onRandom },
      { id: 'act:console', kind: 'action', label: 'open signals console', hint: 'transmissions · constellation · cargo', run: onConsole },
      { id: 'act:mail', kind: 'action', label: 'open messenger', hint: 'private transmissions', run: onMessenger },
      { id: 'act:nova', kind: 'action', label: 'open supernova feed', hint: 'galaxy-wide', run: onNova },
    ]

    const planets: Entry[] = users
      .filter((u) => !u.mock || u.id !== currentUser?.id)
      .map((u) => ({
        id: `u:${u.id}`,
        kind: 'planet' as const,
        label: u.name,
        hint: `@${u.handle}${u.id === currentUser?.id ? ' · you' : ''}`,
        user: u,
        run: () => onVisit(u.id),
      }))

    const posts: Entry[] = Object.values(state.posts)
      .filter((p) => p.text.trim())
      .slice(0, 200)
      .map((p) => {
        const u = userById(p.authorId)
        return {
          id: `p:${p.id}`,
          kind: 'post' as const,
          label: p.text.replace(/\s+/g, ' ').slice(0, 70),
          hint: u ? `satellite of @${u.handle}` : 'satellite',
          post: p,
          user: u,
          run: () => u && onVisit(u.id),
        }
      })

    if (!query.trim()) return [...actions, ...planets.slice(0, 6)]
    const scored = [...planets, ...posts, ...actions]
      .map((e) => {
        const a = fuzzy(query, e.label)
        const b = fuzzy(query, e.hint)
        return { e, score: Math.max(a, b) }
      })
      .filter((x) => x.score >= 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 24)
    return scored.map((x) => x.e)
  }, [query, users, state.posts, userById, currentUser, onVisit, onCompose, onConsole, onRandom, onMessenger])

  useEffect(() => setCursor(0), [query])

  // keep the highlighted row scrolled into view during keyboard navigation
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const commit = (e: Entry | undefined) => {
    if (!e) return
    sfx.launch()
    e.run()
    onClose()
  }

  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      setCursor((c) => Math.min(entries.length - 1, c + 1))
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (ev.key === 'Enter') {
      ev.preventDefault()
      commit(entries[cursor])
    } else if (ev.key === 'Escape') {
      ev.preventDefault()
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 px-3 pt-[12vh] backdrop-blur-sm sm:pt-[16vh]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/12 bg-abyss/95 backdrop-blur-2xl"
            style={{ boxShadow: '0 30px 90px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.06)' }}
          >
            <div className="relative flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
              <span className="pointer-events-none font-mono text-xs text-white/35">›</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="search planets, satellites, actions…"
                aria-label="command palette"
                className="w-full bg-transparent font-body text-sm text-white placeholder:text-white/30 focus:outline-none"
              />
              <kbd className="hidden shrink-0 rounded border border-white/12 px-1.5 py-0.5 font-mono text-[9px] text-white/35 sm:block">
                esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto overscroll-contain p-1.5">
              {entries.length === 0 && (
                <div className="px-3 py-8 text-center font-mono text-[11px] uppercase tracking-widest text-white/30">
                  nothing in range
                </div>
              )}
              {entries.map((e, i) => (
                <button
                  key={e.id}
                  data-idx={i}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => commit(e)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    i === cursor ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                    {e.kind === 'planet' && e.user ? (
                      <PlanetBadge seed={e.user.seed} size={26} />
                    ) : e.kind === 'post' && e.user ? (
                      <PlanetBadge seed={e.user.seed} size={18} />
                    ) : (
                      <span className="font-mono text-sm text-white/50">
                        {e.label.includes('supernova') ? '★' : e.label.includes('random') ? '⇢' : e.label.includes('satellite') ? '+' : '◉'}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-white/90">{e.label}</span>
                    <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-white/35">
                      {e.hint}
                    </span>
                  </span>
                  {i === cursor && (
                    <kbd className="shrink-0 rounded border border-white/12 px-1.5 py-0.5 font-mono text-[9px] text-white/35">
                      ↵
                    </kbd>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.08] px-4 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-white/25">
              <span>↑↓ navigate · ↵ jump</span>
              <span>{entries.length} signals</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
