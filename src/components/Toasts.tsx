import { AnimatePresence, motion } from 'framer-motion'

export interface Toast {
  id: string
  kind: 'nova' | 'signal' | 'info'
  title: string
  body?: string
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[60] flex w-[min(420px,92vw)] -translate-x-1/2 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => onDismiss(t.id)}
            className="pointer-events-auto cursor-pointer overflow-hidden rounded-2xl border px-4 py-3 backdrop-blur-2xl"
            style={
              t.kind === 'nova'
                ? {
                    borderColor: 'rgba(255,107,214,.5)',
                    background: 'linear-gradient(120deg, rgba(70,10,60,.9), rgba(15,8,30,.9))',
                    boxShadow: '0 0 60px rgba(255,107,214,.35)',
                  }
                : {
                    borderColor: 'rgba(255,255,255,.12)',
                    background: 'rgba(10,6,24,.9)',
                    boxShadow: '0 12px 40px rgba(0,0,0,.5)',
                  }
            }
          >
            <div className="flex items-center gap-3">
              {t.kind === 'nova' && (
                <motion.div
                  animate={{ scale: [1, 1.35, 1], rotate: [0, 180, 360] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="h-3 w-3 shrink-0 rounded-full bg-nova"
                  style={{ boxShadow: '0 0 16px #ff6bd6' }}
                />
              )}
              <div className="min-w-0">
                <div className="font-display text-[13px] font-semibold tracking-wide text-white">{t.title}</div>
                {t.body && <div className="mt-0.5 text-[12px] leading-snug text-white/60">{t.body}</div>}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
