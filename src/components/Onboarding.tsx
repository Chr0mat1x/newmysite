import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

const STEPS = [
  {
    title: 'You are a planet.',
    body: 'Your size grows with activity. Your colour is yours alone — procedurally generated from your name.',
  },
  {
    title: 'Your posts are satellites.',
    body: 'Each one orbits you. More stars and signals push it further out and make it burn brighter.',
  },
  {
    title: 'Fly instead of scrolling.',
    body: 'Drag to drift, scroll to zoom, click a planet to visit its orbit. No feed. No infinite doom scroll.',
  },
  {
    title: 'Ten stars and it detonates.',
    body: 'A post that reaches ten stars becomes a SUPERNOVA — visible to the entire galaxy for 24 hours.',
  },
]

export function Onboarding({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) setStep(0)
  }, [open])

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else onDone()
  }

  const s = STEPS[step]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 px-3 pb-safe backdrop-blur-md sm:items-center sm:px-4 sm:pb-0"
        >
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4 w-full max-w-lg rounded-3xl border border-white/12 bg-abyss/95 p-5 backdrop-blur-2xl sm:mb-0 sm:p-7"
            style={{ boxShadow: '0 0 120px rgba(255,255,255,.09)' }}
          >
            <div className="mb-4 flex gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className="h-[3px] flex-1 rounded-full transition-all"
                  style={{
                    background: i <= step ? 'linear-gradient(90deg,#6b6b6b,#ffffff,#6b6b6b)' : 'rgba(255,255,255,.1)',
                  }}
                />
              ))}
            </div>
            <h2 className="font-display text-xl font-semibold leading-tight text-white sm:text-2xl">{s.title}</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-white/60 sm:text-[14px]">{s.body}</p>
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={next}
                className="tap flex-1 rounded-xl bg-gradient-to-r from-pulse to-glow py-3 font-display text-sm font-semibold tracking-wide text-black transition-all hover:brightness-110 active:scale-[0.98]"
              >
                {step < STEPS.length - 1 ? 'NEXT' : 'ENTER THE GALAXY'}
              </button>
              <button
                onClick={onDone}
                className="tap rounded-xl px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white/35 hover:text-white/70 active:text-white/70"
              >
                skip
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
