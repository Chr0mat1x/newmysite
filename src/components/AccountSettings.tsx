import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useGalaxy } from '../state/store'
import { PlanetBadge } from './PlanetBadge'
import { sfx } from '../lib/audio'
import { PASSWORD_MIN, STRENGTH_LABELS, strengthOf } from '../lib/auth'
import { isRemote } from '../lib/supabase'

type Tab = 'email' | 'password' | 'danger'

/**
 * Everything a planet can do to its own account, behind one panel: change the
 * email, change the key, sign every other device out, or delete the world.
 *
 * Email and password changes go straight to Supabase Auth. Deletion is the only
 * one that needs a privileged call (`delete_me`), because `auth.users` is not
 * writable with the anon key.
 */
export function AccountSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUser, changeEmail, changePassword, signOutEverywhere, deleteAccount } = useGalaxy()
  const [tab, setTab] = useState<Tab>('email')
  const [email, setEmail] = useState('')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reset = () => {
    setError(null)
    setNotice(null)
  }

  const pick = (t: Tab) => {
    sfx.click()
    reset()
    setTab(t)
  }

  const submitEmail = async () => {
    reset()
    setBusy(true)
    const err = await changeEmail(email)
    setBusy(false)
    if (err) return setError(err)
    setNotice(
      isRemote
        ? `Confirmation sent to ${email.trim().toLowerCase()}. Your old address keeps working until you open that link.`
        : `Your planet now signs in with ${email.trim().toLowerCase()}.`,
    )
    setEmail('')
  }

  const submitPassword = async () => {
    reset()
    if (next !== confirm) return setError('the two passwords do not match')
    setBusy(true)
    const err = await changePassword(current, next)
    setBusy(false)
    if (err) return setError(err)
    setNotice('Key changed.')
    setCurrent('')
    setNext('')
    setConfirm('')
  }

  const confirmSignOutAll = async () => {
    reset()
    setBusy(true)
    const err = await signOutEverywhere()
    setBusy(false)
    if (err) return setError(err)
    onClose()
  }

  const confirmDelete = async () => {
    reset()
    const wanted = (currentUser?.handle ?? '').toLowerCase()
    if (typed.trim().toLowerCase().replace(/^@/, '') !== wanted) {
      return setError(`type @${currentUser?.handle} to confirm`)
    }
    setBusy(true)
    const err = await deleteAccount()
    setBusy(false)
    if (err) return setError(err)
    // the store has already dropped the session and re-read the public galaxy,
    // so closing the panel is all that is left — no sign-out call needed
    onClose()
  }

  const canSubmitPassword = current.length > 0 && next.length >= PASSWORD_MIN && next === confirm

  return (
    <AnimatePresence>
      {open && currentUser && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-label="account settings"
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-3 bottom-3 z-[71] mx-auto max-h-[88dvh] max-w-lg overflow-hidden rounded-3xl border border-white/12 bg-abyss/95 backdrop-blur-2xl sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2"
            style={{ boxShadow: '0 0 120px rgba(255,255,255,.08)' }}
          >
            <div className="flex items-center gap-3 border-b border-white/10 p-4">
              <PlanetBadge seed={currentUser.seed} size={36} />
              <div className="min-w-0">
                <div className="truncate text-sm text-white/90">{currentUser.name}</div>
                <div className="truncate font-mono text-[10px] text-white/40">@{currentUser.handle}</div>
              </div>
              <button
                onClick={onClose}
                aria-label="close settings"
                className="tap ml-auto rounded-lg px-3 py-1 text-white/45 transition-colors hover:text-white active:bg-white/5"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-1 border-b border-white/10 p-2">
              {(['email', 'password', 'danger'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => pick(t)}
                  className={`tap flex-1 rounded-lg py-2 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                    tab === t ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {t === 'email' ? 'email' : t === 'password' ? 'password' : 'danger'}
                </button>
              ))}
            </div>

            <div className="max-h-[calc(88dvh-9rem)] space-y-3 overflow-y-auto overscroll-contain p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {tab === 'email' && (
                <div className="space-y-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                    current · {currentUser.email ?? 'visitor — no address'}
                  </p>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                      new email
                    </span>
                    <input
                      type="email"
                      inputMode="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@orbit.space"
                      autoComplete="email"
                      aria-label="new email"
                      className="input"
                    />
                  </label>
                  <button
                    onClick={() => void submitEmail()}
                    disabled={!email.trim() || busy}
                    className="tap w-full rounded-xl bg-gradient-to-r from-pulse to-glow py-2.5 font-display text-xs font-semibold tracking-wide text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30"
                  >
                    {busy ? 'SENDING…' : 'CHANGE EMAIL'}
                  </button>
                  <p className="text-[11px] leading-relaxed text-white/40">
                    {isRemote
                      ? 'A confirmation link goes to the new address. Nothing changes until you open it, so you can never lock yourself out with a typo.'
                      : 'This offline build has no mail, so the address changes right away.'}
                  </p>
                </div>
              )}

              {tab === 'password' && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                      current password
                    </span>
                    <input
                      type="password"
                      value={current}
                      onChange={(e) => setCurrent(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      aria-label="current password"
                      className="input"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                      new password
                    </span>
                    <input
                      type="password"
                      value={next}
                      onChange={(e) => setNext(e.target.value)}
                      placeholder={`at least ${PASSWORD_MIN} characters`}
                      autoComplete="new-password"
                      aria-label="new password"
                      className="input"
                    />
                    {next.length > 0 && (
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="flex gap-1">
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className={`h-1 w-8 rounded-full transition-colors ${
                                i <= strengthOf(next) ? 'bg-white/70' : 'bg-white/10'
                              }`}
                            />
                          ))}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                          {STRENGTH_LABELS[strengthOf(next)]}
                        </span>
                      </span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                      confirm new password
                    </span>
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="repeat it"
                      autoComplete="new-password"
                      aria-label="confirm new password"
                      className="input"
                    />
                    {confirm.length > 0 && confirm !== next && (
                      <span className="mt-1 block font-mono text-[10px] text-white/45">the two do not match yet</span>
                    )}
                  </label>
                  <button
                    onClick={() => void submitPassword()}
                    disabled={!canSubmitPassword || busy}
                    className="tap w-full rounded-xl bg-gradient-to-r from-pulse to-glow py-2.5 font-display text-xs font-semibold tracking-wide text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30"
                  >
                    {busy ? 'SAVING…' : 'CHANGE PASSWORD'}
                  </button>
                  <button
                    onClick={() => void confirmSignOutAll()}
                    disabled={busy}
                    className="tap w-full rounded-xl border border-white/12 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/60 transition-colors hover:border-white/30 hover:text-white disabled:opacity-30"
                  >
                    sign out on every device
                  </button>
                </div>
              )}

              {tab === 'danger' && (
                <div className="space-y-3">
                  <p className="text-[12px] leading-relaxed text-white/55">
                    Deleting your planet removes your account, your satellites and every signal you left. This cannot
                    be undone.
                  </p>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                      type @{currentUser.handle} to confirm
                    </span>
                    <input
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder={`@${currentUser.handle}`}
                      aria-label="confirm delete"
                      className="input"
                    />
                  </label>
                  <button
                    onClick={() => void confirmDelete()}
                    disabled={typed.trim().length === 0 || busy}
                    className="tap w-full rounded-xl border border-red-400/40 bg-red-500/10 py-2.5 font-display text-xs font-semibold tracking-wide text-red-200 transition-all hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-30"
                  >
                    {busy ? 'DELETING…' : 'DELETE MY PLANET'}
                  </button>
                </div>
              )}

              {error && (
                <p role="alert" className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] text-white/70">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] text-white/70">
                  {notice}
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
