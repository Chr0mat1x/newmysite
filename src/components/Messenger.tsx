import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGalaxy } from '../state/store'
import type { User } from '../types'
import { PlanetBadge } from './PlanetBadge'
import { sfx } from '../lib/audio'
import { timeAgo } from '../lib/math'
import { useIsMobile } from '../lib/useMedia'

interface Props {
  open: boolean
  onClose: () => void
  /** peer to open straight away — set when messaging from a planet */
  initialPeer?: string | null
  onVisit: (userId: string) => void
}

/** Which list the panel shows when nothing is open. */
type Tab = 'direct' | 'clusters'
type View =
  | { kind: 'list' }
  | { kind: 'direct'; peerId: string }
  | { kind: 'cluster'; clusterId: string }
  | { kind: 'newCluster' }

/**
 * Private transmissions between planets. Threads live in the same galaxy state
 * as everything else, so the panel is only a view: it reads `threads`,
 * `clusters` and the message lists and never holds message data of its own.
 *
 * Two shapes share the panel: a direct thread (one peer) and a cluster (a named
 * group). The store folds both out of the same flat message list, so switching
 * between them is just a change of `view`.
 */
export function Messenger({ open, onClose, initialPeer, onVisit }: Props) {
  const {
    threads,
    threadWith,
    unreadCount,
    sendMessage,
    readThread,
    currentUser,
    userById,
    clusters,
    clusterMessages,
    clusterUnreadCount,
    searchPlanets,
    createCluster,
    sendClusterMessage,
    readCluster,
    leaveCluster,
  } = useGalaxy()

  const [tab, setTab] = useState<Tab>('direct')
  const [view, setView] = useState<View>({ kind: 'list' })
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [searching, setSearching] = useState(false)
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement>(null)

  // a peer passed in from a planet opens straight onto that thread
  useEffect(() => {
    if (open) {
      setView(initialPeer ? { kind: 'direct', peerId: initialPeer } : { kind: 'list' })
      setTab('direct')
      setError(null)
      setQuery('')
    }
  }, [open, initialPeer])

  const peer = view.kind === 'direct' ? userById(view.peerId) : undefined
  const clusterThread = view.kind === 'cluster' ? clusters.find((c) => c.cluster.id === view.clusterId) : undefined

  const messages = useMemo(() => {
    if (view.kind === 'direct') return threadWith(view.peerId)
    if (view.kind === 'cluster') return clusterMessages(view.clusterId)
    return []
  }, [view, threadWith, clusterMessages])

  // Opening a conversation clears its badge. Doing it in an effect rather than on
  // the click keeps it correct when the panel is opened straight onto a peer.
  useEffect(() => {
    if (!open) return
    if (view.kind === 'direct') readThread(view.peerId)
    if (view.kind === 'cluster') readCluster(view.clusterId)
  }, [open, view, readThread, readCluster])

  // keep the newest message in view as the thread grows
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, view])

  // debounce the directory lookup so a fast typist does not fire a request per key
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    let live = true
    setSearching(true)
    const t = setTimeout(async () => {
      const found = await searchPlanets(q)
      if (live) {
        setResults(found.filter((u) => u.id !== currentUser?.id))
        setSearching(false)
      }
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query, searchPlanets, currentUser?.id])

  const openDirect = useCallback((id: string) => {
    sfx.click()
    setView({ kind: 'direct', peerId: id })
    setQuery('')
    setResults([])
    setError(null)
  }, [])

  const submit = async () => {
    const text = draft.trim()
    if (!text || sending) return
    if (view.kind === 'list' || view.kind === 'newCluster') return
    setSending(true)
    setError(null)
    const err =
      view.kind === 'direct' ? await sendMessage(view.peerId, text) : await sendClusterMessage(view.clusterId, text)
    setSending(false)
    if (err) setError(err)
    else setDraft('')
  }

  const headerTitle =
    view.kind === 'direct' ? peer?.name : view.kind === 'cluster' ? clusterThread?.cluster.name : null

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
            initial={isMobile ? { y: '100%', opacity: 0.6 } : { x: '105%', opacity: 0.4 }}
            animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
            exit={isMobile ? { y: '100%', opacity: 0.4 } : { x: '105%', opacity: 0.2 }}
            transition={{ duration: isMobile ? 0.42 : 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-50 flex flex-col border-white/10 bg-abyss/90 backdrop-blur-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[88dvh] max-sm:rounded-t-3xl max-sm:border-t sm:bottom-0 sm:right-0 sm:top-0 sm:w-[400px] sm:border-l"
            style={{ boxShadow: '-40px 0 120px rgba(0,0,0,.7)' }}
            aria-label="messenger"
          >
            <div className="flex shrink-0 justify-center pb-1 pt-3 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-white/25" />
            </div>

            <header className="relative shrink-0 border-b border-white/[0.07] px-5 pb-4 pt-4 sm:pt-6">
              <button
                onClick={onClose}
                aria-label="close messenger"
                className="tap absolute right-3 top-3 rounded-lg px-3 py-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white active:bg-white/5"
              >
                ✕
              </button>

              {headerTitle ? (
                <div className="flex items-center gap-3 pr-8">
                  <button
                    onClick={() => {
                      setView({ kind: 'list' })
                      setError(null)
                    }}
                    aria-label="back to threads"
                    className="tap -ml-1 rounded-lg px-1.5 py-1 text-white/50 transition-colors hover:text-white"
                  >
                    ←
                  </button>
                  {view.kind === 'direct' && peer ? (
                    <>
                      <PlanetBadge seed={peer.seed} size={34} />
                      <div className="min-w-0">
                        <div className="truncate font-display text-[15px] font-semibold text-white">{peer.name}</div>
                        <button
                          onClick={() => {
                            onVisit(peer.id)
                            onClose()
                          }}
                          className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-white/40 transition-colors hover:text-white/80"
                        >
                          @{peer.handle} · fly there →
                        </button>
                      </div>
                    </>
                  ) : clusterThread ? (
                    <>
                      <ClusterBadge members={clusterThread.members} />
                      <div className="min-w-0">
                        <div className="truncate font-display text-[15px] font-semibold text-white">
                          {clusterThread.cluster.name}
                        </div>
                        <div className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                          {clusterThread.members.length} planets
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : view.kind === 'newCluster' ? (
                <>
                  <button
                    onClick={() => setView({ kind: 'list' })}
                    aria-label="back to threads"
                    className="tap -ml-1 mb-1 rounded-lg px-1.5 py-1 text-white/50 transition-colors hover:text-white"
                  >
                    ←
                  </button>
                  <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-white/35">new cluster</div>
                  <h2 className="mt-1 font-display text-lg font-semibold text-white">gather planets</h2>
                </>
              ) : (
                <>
                  <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-white/35">messenger</div>
                  <h2 className="mt-1 font-display text-lg font-semibold text-white">
                    private transmissions
                    {unreadCount + clusterUnreadCount > 0 && (
                      <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 font-mono text-[10px] text-white/80">
                        {unreadCount + clusterUnreadCount}
                      </span>
                    )}
                  </h2>
                </>
              )}
            </header>

            {view.kind === 'newCluster' ? (
              <NewCluster
                onCancel={() => setView({ kind: 'list' })}
                onCreated={(clusterId) => setView({ kind: 'cluster', clusterId })}
                onCreate={createCluster}
                searchPlanets={searchPlanets}
                currentUserId={currentUser.id}
              />
            ) : headerTitle ? (
              <>
                <div
                  ref={scrollRef}
                  className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4"
                  aria-label="message thread"
                >
                  {view.kind === 'cluster' && clusterThread && (
                    <div className="mb-3 flex flex-wrap gap-1.5 border-b border-white/[0.07] pb-3">
                      {clusterThread.members.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            onVisit(m.id)
                            onClose()
                          }}
                          className="tap flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-1 transition-colors hover:border-white/25"
                        >
                          <PlanetBadge seed={m.seed} size={16} />
                          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/50">
                            {m.id === currentUser.id ? 'you' : m.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {messages.length === 0 && (
                    <p className="px-2 py-8 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
                      no transmissions yet — say hello
                    </p>
                  )}
                  {messages.map((m) => {
                    const mine = m.from === currentUser.id
                    const author = userById(m.from)
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[78%]">
                          {view.kind === 'cluster' && !mine && (
                            <span className="mb-0.5 ml-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
                              {author?.name ?? 'unknown'}
                            </span>
                          )}
                          <div
                            className={`rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                              mine
                                ? 'bg-white/[0.14] text-white/90'
                                : 'border border-white/10 bg-white/[0.04] text-white/80'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">
                              {timeAgo(m.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {view.kind === 'cluster' && (
                  <div className="shrink-0 border-t border-white/[0.07] px-4 pt-2">
                    <button
                      onClick={async () => {
                        if (view.kind !== 'cluster') return
                        const err = await leaveCluster(view.clusterId)
                        if (err) setError(err)
                        else setView({ kind: 'list' })
                      }}
                      className="tap w-full py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/25 transition-colors hover:text-white/60"
                    >
                      leave this cluster
                    </button>
                  </div>
                )}

                <div className="shrink-0 border-t border-white/[0.07] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
                  {error && (
                    <p
                      role="alert"
                      className="mb-2 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[11px] text-white/70"
                    >
                      {error}
                    </p>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void submit()
                        }
                      }}
                      rows={1}
                      maxLength={2000}
                      placeholder={view.kind === 'cluster' ? 'send to the cluster…' : 'send a private transmission…'}
                      aria-label="message text"
                      className="input max-h-32 flex-1 resize-none py-2.5 text-[13px]"
                    />
                    <button
                      onClick={() => void submit()}
                      disabled={!draft.trim() || sending}
                      aria-label="send message"
                      className="tap shrink-0 rounded-xl bg-gradient-to-r from-glow via-pulse to-nova px-4 py-2.5 font-display text-[12px] font-bold tracking-wider text-black transition-all hover:brightness-110 active:scale-95 disabled:opacity-30"
                    >
                      {sending ? '…' : 'SEND'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 px-4 pt-3">
                  <div className="flex gap-1 rounded-xl border border-white/[0.07] p-1">
                    {(['direct', 'clusters'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setTab(t)
                          sfx.hover()
                        }}
                        aria-label={`${t} tab`}
                        className={`tap flex-1 rounded-lg py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                          tab === t ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                        }`}
                      >
                        {t}
                        {t === 'clusters' && clusterUnreadCount > 0 && (
                          <span className="ml-1.5 rounded-full bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold text-black">
                            {clusterUnreadCount}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="find a planet by @handle or name…"
                      aria-label="find planets"
                      className="input py-2 text-[12px]"
                    />
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                  {query.trim().length >= 2 ? (
                    <SearchResults
                      results={results}
                      searching={searching}
                      onOpen={openDirect}
                      onVisit={(id) => {
                        onVisit(id)
                        onClose()
                      }}
                    />
                  ) : tab === 'direct' ? (
                    threads.length === 0 ? (
                      <Empty
                        glyph="✉"
                        title="No transmissions yet."
                        sub="find a planet above, or open one and send a private message"
                      />
                    ) : (
                      threads.map((t) => (
                        <button
                          key={t.peer.id}
                          onClick={() => {
                            sfx.click()
                            setView({ kind: 'direct', peerId: t.peer.id })
                          }}
                          className="tap flex w-full items-center gap-3 rounded-xl border border-white/[0.07] px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                        >
                          <PlanetBadge seed={t.peer.seed} size={38} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-display text-[13px] font-semibold text-white/90">
                                {t.peer.name}
                              </span>
                              {t.unread > 0 && (
                                <span className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold text-black">
                                  {t.unread}
                                </span>
                              )}
                            </div>
                            <div className="truncate text-[11px] text-white/45">
                              {t.last.from === currentUser.id ? 'you: ' : ''}
                              {t.last.text}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">
                            {timeAgo(t.last.createdAt)}
                          </span>
                        </button>
                      ))
                    )
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          sfx.click()
                          setView({ kind: 'newCluster' })
                        }}
                        className="tap mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-2.5 font-display text-[11px] font-semibold tracking-wide text-white/60 transition-colors hover:border-white/35 hover:text-white"
                      >
                        + NEW CLUSTER
                      </button>
                      {clusters.length === 0 ? (
                        <Empty glyph="◍" title="No clusters yet." sub="gather a few planets into one conversation" />
                      ) : (
                        clusters.map((c) => (
                          <button
                            key={c.cluster.id}
                            onClick={() => {
                              sfx.click()
                              setView({ kind: 'cluster', clusterId: c.cluster.id })
                            }}
                            className="tap flex w-full items-center gap-3 rounded-xl border border-white/[0.07] px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                          >
                            <ClusterBadge members={c.members} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-display text-[13px] font-semibold text-white/90">
                                  {c.cluster.name}
                                </span>
                                {c.unread > 0 && (
                                  <span className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold text-black">
                                    {c.unread}
                                  </span>
                                )}
                              </div>
                              <div className="truncate text-[11px] text-white/45">
                                {c.members.length} planets
                                {c.last ? ` · ${c.last.text}` : ' · no lines yet'}
                              </div>
                            </div>
                            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">
                              {timeAgo(c.last?.createdAt ?? c.cluster.createdAt)}
                            </span>
                          </button>
                        ))
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

/** Overlapping planet avatars standing in for a cluster's icon. */
function ClusterBadge({ members }: { members: User[] }) {
  const shown = members.slice(0, 3)
  return (
    <div className="relative h-[38px] w-[38px] shrink-0">
      {shown.map((m, i) => (
        <div
          key={m.id}
          className="absolute rounded-full ring-2 ring-abyss"
          style={{ left: i * 8, top: i * 4, zIndex: shown.length - i }}
        >
          <PlanetBadge seed={m.seed} size={26} />
        </div>
      ))}
    </div>
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

function SearchResults({
  results,
  searching,
  onOpen,
  onVisit,
}: {
  results: User[]
  searching: boolean
  onOpen: (id: string) => void
  onVisit: (id: string) => void
}) {
  if (searching && results.length === 0) {
    return (
      <p className="px-2 py-8 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
        scanning the galaxy…
      </p>
    )
  }
  if (results.length === 0) {
    return (
      <p className="px-2 py-8 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
        no planets match that
      </p>
    )
  }
  return (
    <>
      {results.map((u) =>
        u.mock ? (
          <div
            key={u.id}
            className="mb-1 flex w-full items-center gap-3 rounded-xl border border-white/[0.05] px-3 py-2.5 opacity-55"
          >
            <PlanetBadge seed={u.seed} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[13px] font-semibold text-white/80">{u.name}</div>
              <div className="truncate font-mono text-[10px] text-white/35">@{u.handle} · demo planet</div>
            </div>
            <button
              onClick={() => onVisit(u.id)}
              className="tap shrink-0 rounded-lg border border-white/12 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/50 transition-colors hover:text-white"
            >
              fly there
            </button>
          </div>
        ) : (
          <button
            key={u.id}
            onClick={() => onOpen(u.id)}
            className="tap mb-1 flex w-full items-center gap-3 rounded-xl border border-white/[0.07] px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]"
          >
            <PlanetBadge seed={u.seed} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[13px] font-semibold text-white/90">{u.name}</div>
              <div className="truncate font-mono text-[10px] text-white/40">@{u.handle}</div>
            </div>
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">message →</span>
          </button>
        ),
      )}
    </>
  )
}

/** Name a cluster and pick its planets. The creator is always a member. */
function NewCluster({
  onCancel,
  onCreated,
  onCreate,
  searchPlanets,
  currentUserId,
}: {
  onCancel: () => void
  onCreated: (clusterId: string) => void
  onCreate: (name: string, memberIds: string[]) => Promise<{ error: string | null; clusterId: string | null }>
  searchPlanets: (term: string) => Promise<User[]>
  currentUserId: string
}) {
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [selected, setSelected] = useState<User[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    let live = true
    const t = setTimeout(async () => {
      const found = await searchPlanets(q)
      if (live) setResults(found.filter((u) => u.id !== currentUserId && !u.mock))
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query, searchPlanets, currentUserId])

  const toggle = (u: User) => {
    sfx.hover()
    setSelected((prev) => (prev.some((s) => s.id === u.id) ? prev.filter((s) => s.id !== u.id) : [...prev, u]))
  }

  const create = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    const { error: err, clusterId } = await onCreate(name, selected.map((s) => s.id))
    setBusy(false)
    if (err) setError(err)
    else if (clusterId) onCreated(clusterId)
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
            cluster name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. the outer rim"
            aria-label="cluster name"
            className="input py-2 text-[13px]"
          />
        </label>

        <div className="mt-4">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
            members{selected.length > 0 ? ` · ${selected.length}` : ''}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u)}
                className="tap flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-2 py-1"
              >
                <PlanetBadge seed={u.seed} size={16} />
                <span className="font-mono text-[10px] text-white/70">{u.name}</span>
                <span className="text-white/40">✕</span>
              </button>
            ))}
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-1">
              <PlanetBadge seed={0} size={16} />
              <span className="font-mono text-[10px] text-white/40">you</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search planets to add…"
            aria-label="search members"
            className="input py-2 text-[12px]"
          />
          <div className="mt-2">
            {query.trim().length >= 2 && results.length === 0 && (
              <p className="px-2 py-4 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
                no planets match that
              </p>
            )}
            {results.map((u) => {
              const on = selected.some((s) => s.id === u.id)
              return (
                <button
                  key={u.id}
                  onClick={() => toggle(u)}
                  className={`tap mb-1 flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                    on ? 'border-white/30 bg-white/[0.07]' : 'border-white/[0.07] hover:border-white/20'
                  }`}
                >
                  <PlanetBadge seed={u.seed} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[12px] font-semibold text-white/85">{u.name}</div>
                    <div className="truncate font-mono text-[10px] text-white/40">@{u.handle}</div>
                  </div>
                  <span className={`font-mono text-[10px] ${on ? 'text-white' : 'text-white/30'}`}>
                    {on ? '✓' : '+'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.07] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        {error && (
          <p
            role="alert"
            className="mb-2 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[11px] text-white/70"
          >
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="tap rounded-xl border border-white/12 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-white/50 transition-colors hover:text-white"
          >
            cancel
          </button>
          <button
            onClick={() => void create()}
            disabled={!name.trim() || busy}
            className="tap flex-1 rounded-xl bg-gradient-to-r from-glow via-pulse to-nova px-4 py-2.5 font-display text-[12px] font-bold tracking-wider text-black transition-all hover:brightness-110 active:scale-95 disabled:opacity-30"
          >
            {busy ? 'FORMING…' : 'CREATE CLUSTER'}
          </button>
        </div>
      </div>
    </>
  )
}
