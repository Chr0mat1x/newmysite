import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useGalaxy } from '../state/store'
import { PlanetBadge } from './PlanetBadge'
import { sfx } from '../lib/audio'
import { useIsMobile } from '../lib/useMedia'
import {
  loadNotifyPrefs,
  notificationsSupported,
  systemPermission,
  type NotifyPrefs,
} from '../lib/notifications'

const GLYPH: Record<string, string> = {
  message: '✉',
  cluster: '◍',
  signal: '◈',
  supernova: '★',
}

/** "3m", "2h", "5d" — short enough for a mono meta column. */
function ago(at: number): string {
  const s = Math.max(1, Math.round((Date.now() - at) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

export function Notifications({
  open,
  onClose,
  onVisit,
  onMessage,
}: {
  open: boolean
  onClose: () => void
  onVisit: (id: string) => void
  onMessage: (peerId: string) => void
}) {
  const { activity, markActivityRead, userById, enableSystemNotifications, disableSystemNotifications } = useGalaxy()
  const isMobile = useIsMobile()
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => loadNotifyPrefs())
  const [permission, setPermission] = useState(() => systemPermission())

  // Opening the bell is the "I have seen these" gesture — clear the badge.
  useEffect(() => {
    if (open) markActivityRead()
  }, [open, markActivityRead])

  const enableSystem = async () => {
    await enableSystemNotifications()
    setPermission(systemPermission())
    setPrefs(loadNotifyPrefs())
  }

  const toggleSystem = () => {
    if (prefs.system) {
      void disableSystemNotifications().then(() => setPrefs(loadNotifyPrefs()))
      return
    }
    if (permission === 'granted') {
      // permission already granted: just turn the mirror + subscription back on
      void enableSystemNotifications().then(() => setPrefs(loadNotifyPrefs()))
      return
    }
    void enableSystem()
  }

  const note =
    permission === 'unsupported'
      ? 'this browser cannot show system notifications — the bell still works'
      : permission === 'denied'
        ? 'notifications are blocked in your browser settings'
        : prefs.system
          ? 'we will alert you about new transmissions even when the app is closed'
          : 'turn on to get alerts about new transmissions'

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
              className="pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-abyss/95 backdrop-blur-2xl sm:w-[min(560px,94vw)] sm:rounded-3xl"
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

              <header className="relative flex shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6 sm:py-5">
                <div>
                  <h3 className="font-display text-lg font-semibold tracking-wide text-white">Notifications</h3>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                    what reached your orbit
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="close notifications"
                  className="tap rounded-lg px-3 text-white/40 hover:bg-white/5 hover:text-white active:bg-white/5 active:text-white"
                >
                  ✕
                </button>
              </header>

              <div className="relative flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-5">
                {activity.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4 h-14 w-14 rounded-full border border-white/15" />
                    <p className="font-display text-sm text-white/60">All quiet in your orbit.</p>
                    <p className="mt-1 max-w-xs font-mono text-[10px] uppercase tracking-widest text-white/30">
                      messages, signals and supernovae land here
                    </p>
                  </div>
                )}
                {activity.map((a) => {
                  const actor = a.actorId ? userById(a.actorId) : undefined
                  const isMessage = a.kind === 'message' || a.kind === 'cluster'
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        sfx.click()
                        onClose()
                        if (isMessage && a.actorId) onMessage(a.actorId)
                        else if (a.actorId) onVisit(a.actorId)
                      }}
                      className="tap flex w-full items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                    >
                      {actor ? (
                        <PlanetBadge seed={actor.seed} size={30} />
                      ) : (
                        <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border border-white/15 text-sm">
                          {GLYPH[a.kind]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate font-display text-[13px] text-white/90">{a.title}</span>
                          <span className="ml-auto shrink-0 font-mono text-[9px] text-white/35">{ago(a.at)}</span>
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-white/55">{a.body}</div>
                      </div>
                      <span className="mt-0.5 shrink-0 text-white/25">{GLYPH[a.kind]}</span>
                    </button>
                  )
                })}
              </div>

              {notificationsSupported() && (
                <div className="shrink-0 border-t border-white/[0.07] px-5 py-3 sm:px-6">
                  <button
                    onClick={toggleSystem}
                    disabled={permission === 'denied'}
                    className="tap flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1.5 text-left disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <div className="font-display text-[12px] text-white/80">System notifications</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-white/45">{note}</div>
                    </div>
                    <span
                      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                        prefs.system && permission === 'granted'
                          ? 'border-white/50 bg-white/80'
                          : 'border-white/20 bg-white/10'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                          prefs.system && permission === 'granted' ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </span>
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
