import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGalaxy } from '../state/store'
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

/**
 * Private transmissions between two planets. Threads live in the same galaxy
 * state as everything else, so the panel is only a view: it reads `threads` and
 * `threadWith` and never holds message data of its own.
 */
export function Messenger({ open, onClose, initialPeer, onVisit }: Props) {
  const { threads, threadWith, unreadCount, sendMessage, readThread, currentUser, userById } = useGalaxy()
  const [peerId, setPeerId] = useState<string | null>(initialPeer ?? null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setPeerId(initialPeer ?? null)
  }, [open, initialPeer])

  const peer = peerId ? userById(peerId) : undefined
  const messages = useMemo(() => (peerId ? threadWith(peerId) : []), [peerId, threadWith])

  // Opening a thread clears its badge. Doing it in an effect rather than on the
  // click keeps it correct when the panel is opened straight onto a peer.
  useEffect(() => {
    if (open && peerId) readThread(peerId)
  }, [open, peerId, readThread])

  // keep the newest message in view as the thread grows
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, peerId])

  const submit = async () => {
    const text = draft.trim()
    if (!text || !peerId || sending) return
    setSending(true)
    setError(null)
    const err = await sendMessage(peerId, text)
    setSending(false)
    if (err) setError(err)
    else setDraft('')
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

              {peer ? (
                <div className="flex items-center gap-3 pr-8">
                  <button
                    onClick={() => setPeerId(null)}
                    aria-label="back to threads"
                    className="tap -ml-1 rounded-lg px-1.5 py-1 text-white/50 transition-colors hover:text-white"
                  >
                    ←
                  </button>
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
                </div>
              ) : (
                <>
                  <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-white/35">messenger</div>
                  <h2 className="mt-1 font-display text-lg font-semibold text-white">
                    private transmissions
                    {unreadCount > 0 && (
                      <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 font-mono text-[10px] text-white/80">
                        {unreadCount}
                      </span>
                    )}
                  </h2>
                </>
              )}
            </header>

            {peer ? (
              <>
                <div
                  ref={scrollRef}
                  className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4"
                  aria-label="message thread"
                >
                  {messages.length === 0 && (
                    <p className="px-2 py-8 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
                      no transmissions yet — say hello
                    </p>
                  )}
                  {messages.map((m) => {
                    const mine = m.from === currentUser.id
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
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
                    )
                  })}
                </div>

                <div className="shrink-0 border-t border-white/[0.07] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
                  {error && (
                    <p role="alert" className="mb-2 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[11px] text-white/70">
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
                      placeholder="send a private transmission…"
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
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                {threads.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
                    <div className="font-mono text-3xl text-white/20">✉</div>
                    <p className="mt-4 font-display text-sm text-white/60">No transmissions yet.</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-white/30">
                      open a planet and send a private message
                    </p>
                  </div>
                ) : (
                  threads.map((t) => (
                    <button
                      key={t.peer.id}
                      onClick={() => {
                        sfx.click()
                        setPeerId(t.peer.id)
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
                )}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
