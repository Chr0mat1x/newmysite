import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { PlanetBadge } from './PlanetBadge'
import { useGalaxy } from '../state/store'
import { sfx } from '../lib/audio'
import { planetSeed } from '../lib/seed'
import { PASSWORD_MIN, STRENGTH_LABELS, strengthOf } from '../lib/auth'
import { isRemote, recovery, mailLink } from '../lib/supabase'

/** How many procedural worlds the launch screen offers to pick from. */
const VARIANTS = [0, 1, 2, 3, 4, 5, 6, 7]

type Mode = 'signup' | 'signin' | 'explore' | 'reset' | 'sent' | 'recover' | 'confirm'

/** Seconds a user must wait before asking for another mail. Auth rate-limits too. */
const RESEND_COOLDOWN = 60

export function AuthGate() {
  const {
    login,
    signUp,
    loginAs,
    resetPassword,
    setPassword: savePassword,
    resendConfirmation,
    refresh,
    users,
    postsOf,
    busy,
    recovering,
    pendingConfirmation,
    clearPendingConfirmation,
  } = useGalaxy()
  const [mode, setMode] = useState<Mode>(() => (recovery.pending ? 'recover' : 'signup'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [handle, setHandle] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [variant, setVariant] = useState(() => Math.floor(Math.random() * VARIANTS.length))
  // unix ms when the resend button unlocks again; 0 means "ready now"
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [linkError, setLinkError] = useState(mailLink.error)

  useEffect(() => mailLink.subscribe(() => setLinkError(mailLink.error)), [])

  // tick only while a cooldown is pending, so the button label can count down
  useEffect(() => {
    if (!resendAt) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [resendAt])

  const cooldownLeft = Math.max(0, Math.ceil((resendAt - now) / 1000))

  // the gate starts in (or switches to) "recover" whenever a recovery link is
  // pending; `recovering` covers the case where the auth event lands after mount
  useEffect(() => {
    if (recovering) setMode('recover')
  }, [recovering])

  // an unverified sign-in (or a fresh signup) parks here until the link is opened
  useEffect(() => {
    if (pendingConfirmation) setMode('confirm')
  }, [pendingConfirmation])

  const seed = useMemo(
    () => planetSeed(name || email.split('@')[0] || 'orbit', name || 'traveler', variant),
    [email, name, variant],
  )

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
    if (next !== 'confirm') clearPendingConfirmation()
  }

  const signupReady =
    !!name.trim() &&
    !!email.trim() &&
    !!handle.trim() &&
    password.length >= PASSWORD_MIN &&
    password === confirm &&
    accepted

  const submit = async () => {
    let err: string | null = null
    if (mode === 'recover') {
      if (password !== confirm) {
        setError('the two passwords do not match')
        return
      }
      err = await savePassword(password)
      if (!err) {
        // updateUser keeps the recovery session; re-read the galaxy into it.
        await refresh()
        return
      }
      setError(err)
      return
    }
    if (mode === 'reset') {
      if (cooldownLeft > 0) return
      err = await resetPassword(email)
      if (!err) {
        // Supabase answers the same way for unknown addresses (to avoid leaking
        // who has an account), so this cannot promise the mail went out.
        setNotice(`if a planet exists for ${email.trim().toLowerCase()}, a reset link is on its way to that inbox`)
        setResendAt(Date.now() + RESEND_COOLDOWN * 1000)
        setMode('sent')
      }
      setError(err)
      return
    }
    if (mode === 'confirm') {
      if (cooldownLeft > 0) return
      err = await resendConfirmation(pendingConfirmation ?? email)
      setError(err)
      if (!err) {
        setNotice(`a fresh confirmation link is on its way to ${pendingConfirmation ?? email.trim().toLowerCase()}`)
        setResendAt(Date.now() + RESEND_COOLDOWN * 1000)
      }
      return
    }
    if (mode === 'signup') {
      if (password !== confirm) {
        setError('the two passwords do not match')
        return
      }
      err = await signUp(email, password, name, variant, handle.trim().toLowerCase())
      setError(err)
      return
    }
    err = await login(email, password)
    setError(err)
  }

  // Seeded demo planets first, then the liveliest ones — so the visitor list is
  // never drowned out by empty accounts created during testing.
  const explore = [...users]
    .sort((a, b) => {
      if (!!a.mock !== !!b.mock) return Number(!!b.mock) - Number(!!a.mock)
      const byPosts = postsOf(b.id).length - postsOf(a.id).length
      return byPosts || a.handle.localeCompare(b.handle)
    })
    .slice(0, 18)

  return (
    <div className="relative z-20 flex min-h-[100dvh] items-center justify-center px-4 py-6 pb-safe pt-safe sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="flex max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-5 backdrop-blur-2xl sm:max-h-[90dvh] sm:p-7"
        style={{ boxShadow: '0 0 120px rgba(255,255,255,.09), inset 0 1px 0 rgba(255,255,255,.06)' }}
      >
        <div className="mb-5 shrink-0 text-center sm:mb-7">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
            className="mx-auto mb-4 h-16 w-16"
          >
            <PlanetBadge seed={seed} size={64} />
          </motion.div>
          <h1 className="font-display text-3xl font-bold tracking-[0.32em] text-white sm:text-4xl">ORBIT</h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.24em] text-pulse/80">
            your posts are satellites
          </p>
          <p className="mx-auto mt-3 max-w-xs text-[13px] leading-relaxed text-white/55 sm:mt-4 sm:text-sm">
            Every user is a planet. Every post orbits them. Fly through the galaxy instead of scrolling a feed.
          </p>
          {linkError && (
            <p role="alert" className="mx-auto mt-4 max-w-xs rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[12px] leading-relaxed text-amber-100/90">
              That confirmation link is no longer valid — it may have expired or already been opened. Sign in, or
              create your planet again to get a fresh link.
            </p>
          )}
        </div>

        <AnimatePresence mode="wait">
          {mode === 'explore' ? (
            <motion.div
              key="explore"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain"
            >
              <div className="mb-2 space-y-1.5 pr-1">
                {explore.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      sfx.click()
                      void loginAs(u.id)
                    }}
                    disabled={busy}
                    onMouseEnter={() => sfx.hover()}
                    className="tap flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2 text-left transition-all hover:border-pulse/40 hover:bg-white/[0.07] active:bg-white/[0.07] disabled:opacity-50"
                  >
                    <PlanetBadge seed={u.seed} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-sm text-white/90">{u.name}</div>
                      <div className="truncate font-mono text-[10px] text-white/40">@{u.handle}</div>
                    </div>
                    {!u.mock && (
                      <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">yours</span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => switchMode('signin')}
                className="tap w-full py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/80 active:text-white/80"
              >
                ← back to sign in
              </button>
            </motion.div>
          ) : (
            <motion.div
              key={mode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -12 }}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain"
            >
              {mode === 'confirm' ? (
                <div className="space-y-3">
                  <p role="status" className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] text-white/80">
                    confirm your address to launch
                  </p>
                  <p className="text-[12px] leading-relaxed text-white/50">
                    We sent a link to <span className="text-white/80">{pendingConfirmation ?? email}</span>. Open it to
                    activate your planet — until then nobody can sign in with this address.
                  </p>
                  <p className="text-[12px] leading-relaxed text-white/40">
                    Nothing yet? Give it a minute and check your spam folder — the link comes from an ORBIT address, not
                    from a person.
                  </p>
                  {!isRemote && (
                    <p className="text-[12px] leading-relaxed text-white/45">
                      This build is fully offline — accounts live only in this browser, so there is no email to send.
                    </p>
                  )}
                  {notice && (
                    <p className="text-[11px] leading-relaxed text-white/50">{notice}</p>
                  )}
                  {error && (
                    <p role="alert" className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] text-white/70">
                      {error}
                    </p>
                  )}
                  <button
                    onClick={() => void submit()}
                    disabled={busy || cooldownLeft > 0}
                    className="tap w-full rounded-xl border border-white/15 py-2.5 font-display text-[13px] font-semibold tracking-wider text-white/80 transition-all hover:border-white/40 hover:text-white active:scale-[0.98] disabled:opacity-30"
                  >
                    {busy ? 'SENDING…' : cooldownLeft > 0 ? `RESEND IN ${cooldownLeft}s` : 'RESEND CONFIRMATION LINK'}
                  </button>
                  <button
                    onClick={() => switchMode('signin')}
                    className="tap w-full py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/80 active:text-white/80"
                  >
                    ← back to sign in
                  </button>
                </div>
              ) : mode === 'recover' ? (
                <div className="space-y-3">
                  <p className="text-[12px] leading-relaxed text-white/50">
                    Recovery link accepted. Choose a new key for your planet.
                  </p>
                  <Field label="new password">
                    <input
                      autoFocus
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                      placeholder={`at least ${PASSWORD_MIN} characters`}
                      autoComplete="new-password"
                      className="input"
                    />
                    {password.length > 0 && (
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="flex gap-1">
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className={`h-1 w-8 rounded-full transition-colors ${
                                i <= strengthOf(password) ? 'bg-white/70' : 'bg-white/10'
                              }`}
                            />
                          ))}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                          {STRENGTH_LABELS[strengthOf(password)]}
                        </span>
                      </span>
                    )}
                  </Field>
                  <Field label="confirm new password">
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                      placeholder="repeat it"
                      autoComplete="new-password"
                      aria-label="confirm new password"
                      className="input"
                    />
                    {confirm.length > 0 && confirm !== password && (
                      <span className="mt-1 block font-mono text-[10px] text-white/45">the two do not match yet</span>
                    )}
                  </Field>
                  {error && (
                    <p role="alert" className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] text-white/70">
                      {error}
                    </p>
                  )}
                  <button
                    onClick={() => void submit()}
                    disabled={password.length < PASSWORD_MIN || password !== confirm || busy}
                    className="tap w-full rounded-xl bg-gradient-to-r from-pulse to-glow py-3 font-display text-sm font-semibold tracking-wider text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30"
                  >
                    {busy ? 'SAVING…' : 'SET NEW KEY'}
                  </button>
                </div>
              ) : mode === 'sent' ? (
                <div className="space-y-3">
                  <p role="status" className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] text-white/70">
                    {notice}
                  </p>
                  <p className="text-[12px] leading-relaxed text-white/45">
                    {isRemote
                      ? 'Open the link from your inbox to choose a new key. It expires after a while, so request another if it has gone stale.'
                      : 'This build is fully offline — accounts live only in this browser, so there is no email to send.'}
                  </p>
                  <button
                    onClick={() => void submit()}
                    disabled={busy || cooldownLeft > 0}
                    className="tap w-full rounded-xl border border-white/15 py-2.5 font-display text-[13px] font-semibold tracking-wider text-white/80 transition-all hover:border-white/40 hover:text-white active:scale-[0.98] disabled:opacity-30"
                  >
                    {busy ? 'SENDING…' : cooldownLeft > 0 ? `RESEND IN ${cooldownLeft}s` : 'SEND ANOTHER LINK'}
                  </button>
                  {error && (
                    <p role="alert" className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] text-white/70">
                      {error}
                    </p>
                  )}
                  <button
                    onClick={() => switchMode('signin')}
                    className="tap w-full py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/80 active:text-white/80"
                  >
                    ← back to sign in
                  </button>
                </div>
              ) : (
                <>
              <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {(['signup', 'signin'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={`tap flex-1 rounded-lg py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                      mode === m ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    {m === 'signup' ? 'create planet' : 'sign in'}
                  </button>
                ))}
              </div>

              {mode === 'signup' && (
                <Field label="display name">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    placeholder="Nova Ashkar"
                    autoComplete="nickname"
                    className="input"
                  />
                </Field>
              )}

              {mode === 'signup' && (
                <Field label="handle">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-white/35">
                      @
                    </span>
                    <input
                      value={handle}
                      onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                      placeholder="nova"
                      autoComplete="username"
                      aria-label="handle"
                      className="input pl-7"
                    />
                  </div>
                  <span className="mt-1 block font-mono text-[10px] text-white/30">
                    your address in the galaxy — 3-20 letters, numbers or _
                  </span>
                </Field>
              )}

              <Field label="email">
                <input
                  autoFocus={mode === 'signin' || mode === 'reset'}
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="you@orbit.space"
                  autoComplete="email"
                  className="input"
                />
                {mode === 'signup' && (
                  <span className="mt-1 block font-mono text-[10px] leading-relaxed text-white/30">
                    {isRemote
                      ? 'we email a confirmation link — open it to activate your planet'
                      : 'this offline build keeps accounts in this browser only'}
                  </span>
                )}
              </Field>

              {mode !== 'reset' && (
                <Field label="password">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    placeholder={mode === 'signup' ? `at least ${PASSWORD_MIN} characters` : '••••••••'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="input"
                  />
                  {mode === 'signup' && password.length > 0 && (
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className={`h-1 w-8 rounded-full transition-colors ${
                              i <= strengthOf(password) ? 'bg-white/70' : 'bg-white/10'
                            }`}
                          />
                        ))}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                        {STRENGTH_LABELS[strengthOf(password)]}
                      </span>
                    </span>
                  )}
                </Field>
              )}

              {mode === 'signup' && (
                <Field label="confirm password">
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    placeholder="repeat it"
                    autoComplete="new-password"
                    aria-label="confirm password"
                    className="input"
                  />
                  {confirm.length > 0 && confirm !== password && (
                    <span className="mt-1 block font-mono text-[10px] text-white/45">the two do not match yet</span>
                  )}
                </Field>
              )}

              {mode === 'signup' && (
                <Field label="world">
                  <div className="flex flex-wrap gap-2 pt-1">
                    {VARIANTS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setVariant(v)
                          sfx.hover()
                        }}
                        aria-label={`world ${v + 1}`}
                        className={`h-12 w-12 rounded-full border transition-transform hover:scale-110 active:scale-95 ${
                          variant === v ? 'border-white' : 'border-white/15'
                        }`}
                        style={{ boxShadow: variant === v ? '0 0 16px rgba(255,255,255,.55)' : 'none' }}
                      >
                        <PlanetBadge seed={planetSeed(name || 'orbit', name || 'traveler', v)} size={44} />
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              {mode === 'signup' && (
                <label className="flex cursor-pointer items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-white"
                    aria-label="accept the rules"
                  />
                  <span className="text-[11px] leading-relaxed text-white/45">
                    I will keep this a decent place to be: no harassment, no spam, no pretending to be someone else.
                    One planet per person.
                  </span>
                </label>
              )}

              {error && (
                <p role="alert" className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] text-white/70">
                  {error}
                </p>
              )}

              <button
                onClick={() => void submit()}
                disabled={mode === 'signup' ? !signupReady || busy : !email.trim() || (mode !== 'reset' && !password) || busy}
                className="tap mt-1 w-full rounded-xl bg-gradient-to-r from-pulse to-glow py-3 font-display text-sm font-semibold tracking-wider text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30"
              >
                {busy
                  ? 'CONTACTING ORBIT…'
                  : mode === 'reset'
                    ? 'SEND RESET LINK'
                    : mode === 'signup'
                      ? 'LAUNCH INTO ORBIT'
                      : 'ENTER ORBIT'}
              </button>

              {mode === 'signin' && (
                <button
                  onClick={() => switchMode('reset')}
                  className="tap w-full py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/35 transition-colors hover:text-white/75 active:text-white/75"
                >
                  forgot your key?
                </button>
              )}

              <button
                onClick={() => switchMode('explore')}
                className="tap w-full py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/80 active:text-white/80"
              >
                or explore a demo planet →
              </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</span>
      {children}
    </label>
  )
}
