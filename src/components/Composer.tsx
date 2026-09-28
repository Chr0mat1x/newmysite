import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useGalaxy } from '../state/store'
import { sfx } from '../lib/audio'

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
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex max-h-[92dvh] w-[min(540px,92vw)] flex-col overflow-hidden rounded-3xl border border-white/12 bg-abyss/95 backdrop-blur-2xl"
              style={{ boxShadow: '0 0 100px rgba(160,107,255,.3)' }}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
              <div>
                <h3 className="font-display text-sm font-semibold tracking-wide text-white">Launch a satellite</h3>
                <p className="font-mono text-[10px] text-white/40">
                  it will orbit @{currentUser?.handle ?? 'you'} forever
                </p>
              </div>
              <button onClick={onClose} className="rounded-lg px-2 py-1 text-white/40 hover:bg-white/5 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') launch()
                }}
                rows={4}
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
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-white/50 hover:border-pulse/40 hover:text-white"
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
                    className="max-h-40 w-full object-cover"
                    onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')}
                  />
                </div>
              )}

              <button
                onClick={launch}
                disabled={busy || (!text.trim() && !image.trim())}
                className="w-full rounded-xl bg-gradient-to-r from-glow via-pulse to-nova py-3 font-display text-sm font-semibold tracking-wider text-black transition-all hover:brightness-110 disabled:opacity-30"
              >
                {busy ? 'IGNITING…' : 'LAUNCH  ⌘↵'}
              </button>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
