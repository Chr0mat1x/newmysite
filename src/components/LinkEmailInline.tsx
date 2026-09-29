import { useState } from 'react'
import { useGalaxy } from '../state/store'
import { PASSWORD_MIN } from '../lib/auth'

/**
 * Lets a planet created before email auth existed (or a demo login) attach
 * credentials so it can be recovered later. Renders nothing once linked.
 */
export function LinkEmailInline({ compact = false }: { compact?: boolean }) {
  const { currentUser, linkEmail } = useGalaxy()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!currentUser) return null

  if (currentUser.email) {
    return (
      <p className={`truncate font-mono ${compact ? 'text-[10px]' : 'text-[11px]'} text-white/35`}>
        {currentUser.email}
      </p>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white/80 active:text-white/80"
      >
        + add email to recover this planet
      </button>
    )
  }

  const submit = async () => {
    const err = await linkEmail(email, password)
    if (err) setError(err)
    else {
      setError(null)
      setDone(true)
      setOpen(false)
    }
  }

  return (
    <div className="w-full space-y-2 rounded-xl border border-white/10 bg-black/30 p-3 text-left">
      <input
        type="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@orbit.space"
        autoComplete="email"
        className="input !text-[13px]"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={`password, ${PASSWORD_MIN}+ characters`}
        autoComplete="new-password"
        className="input !text-[13px]"
      />
      {error && <p className="text-[11px] text-white/60">{error}</p>}
      {done && <p className="text-[11px] text-white/60">linked — you can sign in with it now</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void submit()}
          disabled={!email.trim() || !password}
          className="tap flex-1 rounded-lg border border-white/20 bg-white/[0.06] py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white disabled:opacity-30"
        >
          save
        </button>
        <button
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="tap rounded-lg border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45"
        >
          cancel
        </button>
      </div>
    </div>
  )
}
