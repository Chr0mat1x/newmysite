import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useGalaxy } from '../state/store'
import { sfx } from '../lib/audio'
import { useIsMobile } from '../lib/useMedia'

const SUGGESTED = [
  'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=900&q=70',
  'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70',
]

export function Composer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createPost, currentUser } = useGalaxy()
  const [text, setText] = useState('')
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const isMobile = useIsMobile()

  const launch = () => {
    if (!text.trim() && !image.trim()) return
    setBusy(true)
    createPost(text, image)
    setTimeout(() => {
      setBusy(false)
      setText('')
      setImage('')
      onClose()
    }, 420)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
            <motion.div
              initial={isMobile ? { y: '100%', opacity: 0.7 } : { opacity: 0, y: 40, scale: 0.97 }}
              animate={isMobile ? { y: 0, opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={isMobile ? { y: '100%', opacity: 0.5 } : { opacity: 0, y: 30, scale: 0.98 }}
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/12 bg-abyss/95 backdrop-blur-2xl sm:w-[min(540px,92vw)] sm:rounded-3xl"
              style={{ boxShadow: '0 0 100px rgba(255,255,255,.10)' }}
            >
              {/* grab handle — phone only */}
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

              <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
              <div>
                <h3 className="font-display text-sm font-semibold tracking-wide text-white">Launch a satellite</h3>
                <p className="font-mono text-[10px] text-white/40">
                  it will orbit @{currentUser?.handle ?? 'you'} forever
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="close composer"
                className="tap rounded-lg px-3 text-white/40 hover:bg-white/5 hover:text-white active:bg-white/5 active:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto overscroll-contain p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:pb-5">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') launch()
                }}
                rows={4}
                autoFocus={!isMobile}
                placeholder="what are you sending into the void?"
                className="input w-full resize-none !text-[15px] leading-relaxed"
              />

              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                  image url (optional)
                </div>
                <input
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://…"
                  className="input w-full !text-[13px]"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="font-mono text-[10px] text-white/30">try:</span>
                  {SUGGESTED.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => {
                        setImage(s)
                        sfx.hover()
                      }}
                      className="tap rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] text-white/50 hover:border-pulse/40 hover:text-white active:border-pulse/50 active:text-white"
                    >
                      image {i + 1}
                    </button>
                  ))}
                </div>
              </div>

              {image && (
                <div className="overflow-hidden rounded-xl border border-white/10">
                  <img
                    src={image}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')}
                    className="max-h-40 w-full object-cover grayscale sm:max-h-52"
                  />
                </div>
              )}

              <button
                onClick={launch}
                disabled={busy || (!text.trim() && !image.trim())}
                className="tap w-full rounded-xl bg-gradient-to-r from-glow via-pulse to-nova py-3 font-display text-sm font-semibold tracking-wider text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30"
              >
                {busy ? 'IGNITING…' : isMobile ? 'LAUNCH' : 'LAUNCH  ⌘↵'}
              </button>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
