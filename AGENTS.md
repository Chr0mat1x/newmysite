# ORBIT — repo memory

Social network where every user is a procedurally generated planet and each
post orbits them as a satellite. Monochrome space aesthetic.

## Commands

- `npm run dev` — Vite dev server. It must listen on **port 12000** so the work
  host proxy (`https://work-1-*.prod-runtime.all-hands.dev/`) reaches it.
- `npm run build` — `tsc --noEmit && vite build`. Must stay green.
- `npm run preview` — serve `dist/`.

## Stack

React 18 + TypeScript + Vite 5 + TailwindCSS 3 + Framer Motion. The galaxy is
one `<canvas>` (2D context) driven by `requestAnimationFrame`.

Persistence sits behind the `Backend` interface (`src/lib/backends/types.ts`).
`LocalBackend` (localStorage, key `orbit.galaxy.v1`) is the default and keeps the
app a complete offline product. `SupabaseBackend` takes over when
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set at build time
(`src/lib/supabase.ts` exports the `isRemote` switch). The store holds `mode` and
`linkStatus` so the HUD can show which one is live.

## Local Supabase

Docker is required. `npx supabase start` boots Postgres :54322, REST/Auth
:54321, Studio :54323, Mailpit :54324. Copy the printed API URL + anon key into
`.env.local` (gitignored; `.env.example` is the template). Restart `npm run dev`
afterwards — Vite only reads env files at startup.

The migration `supabase/migrations/*_orbit.sql` owns the schema, RLS, the signup
trigger and `seed_demo_galaxy()`. It is idempotent (drops before create), so it
can be re-applied. `supabase/config.toml` has `enable_anonymous_sign_ins = true`
— required for the visitor path.

Test rows accumulate in the local DB. To get back to a clean demo galaxy, delete
the non-seeded planets via the REST API with the service-role key, or
`npx supabase db reset` (also re-seeds).

## Layout

- `src/App.tsx` — `Shell` (auth vs orbit) and `Orbit` (HUD, panels, keyboard).
- `src/components/GalaxyCanvas.tsx` — canvas element, DPR sizing, all pointer
  gestures (pan / pinch / tap), render loop, `useImperativeHandle` API.
- `src/engine/GalaxyCanvas.ts` — the renderer: planets, orbit rings, satellites,
  supernovae, bursts, warp.
- `src/engine/Starfield.ts` — parallax star layers + nebulae (background).
- `src/engine/layout.ts` — golden-angle spiral placement; radius from activity.
- `src/components/` — OrbitView, Composer, SupernovaFeed, MobileMenu, MiniMap,
  PostCard, AuthGate, Onboarding, Toasts, PlanetBadge.
- `src/state/store.tsx` — context + async actions. Single source of truth. The
  `run()` helper pushes a backend result into state and surfaces failures as
  `lastError`; auth calls (`login`/`signUp`/`loginAs`/`linkEmail`) return an
  error string instead, because the forms render it inline.
- `src/state/reducer.ts` — pure transitions, shared so the local backend can
  reuse them.
- `src/lib/backends/` — `types.ts` (the interface), `local.ts` (localStorage),
  `supabase.ts` (Auth + Postgres + RLS).
- `src/lib/` — `seed.ts` (mock galaxy), `procgen.ts` (planet sprites/hashing),
  `auth.ts` (email hashing/validation for the offline backend), `audio.ts`
  (procedural WebAudio), `storage.ts`, `supabase.ts`, `mappers.ts`,
  `useMedia.ts`, `math.ts`.
- `src/types.ts` — `User`, `Post`, `Signal`, `GalaxyState`,
  `SUPERNOVA_THRESHOLD` (10), `SUPERNOVA_TTL` (24h), `SEED_VERSION`.

## Conventions & gotchas

- **Tailwind `sm` = 640px.** Mobile layout is `max-sm:` / default; desktop
  overrides from `sm:` up. `useIsMobile()` wraps the same breakpoint.
- Panels are **bottom sheets** on phones (drag handle, `pb-safe`) and docked
  side panels / centered modals on desktop. Keep both paths working.
- **Safe areas**: `.pt-safe` `.pb-safe` `.px-safe` utilities in `index.css`;
  `viewport-fit=cover` is set in `index.html`. Use `dvh`, not `vh`.
- **Touch targets** use the `.tap` class (44px min). Inputs are 16px to stop
  iOS Safari zooming on focus.
- **Tap vs click**: selection happens on `pointerup`. The browser then fires a
  synthetic `click` that lands on the freshly mounted orbit backdrop — that is
  why `App.tsx` guards closing with a ~400ms window after a visit
  (`visitGuard` / `closeIfSettled`). Do not remove it.
- **Canvas perf**: stars are drawn with `fillRect` (not `arc`), and DPR is
  capped by viewport width (`<=480px → 2`, `<=900px → 1.5`, else `2`). Measure
  with a micro-benchmark, not headless FPS — headless Chromium uses SwiftShader
  (CPU raster) and reports ~20 FPS regardless.
- **Mock vs local accounts**: seeded users have `mock: true` and ids like
  `u_nova`; locally created ones have `mock: false` and ids like `me_<handle>`.
  Auth is email + password (`login` / `signUp`); seeded accounts have no
  password and are reachable only through `loginAs` from the explore list.
  `linkEmail` lets a passwordless account attach credentials. The password
  salt is the account id, so the hash is computed from the final user object.
- Handle uniqueness is enforced in `handleFromIdentity` (name → base handle →
  numeric suffix); seeded handles count as taken, so a new planet never
  collides with a demo one.
- Planet colour/texture comes from `user.seed` (procedural). "Remix my planet"
  XORs the seed.

## Feature map (beyond the galaxy canvas)

- **Command palette** (`components/CommandPalette.tsx`) — ⌘K / Ctrl+K / `/`.
  Fuzzy-matches planets and actions, arrow keys + Enter fly the camera.
  Search opens while typing in other fields, so it is exempted from the typing
  guard in App's keydown handler.
- **Signals console** (`components/SignalsConsole.tsx`) — three tabs:
  `transmissions` (signals received on my posts), `constellation` (followed
  planets), `cargo` (bookmarked posts). Desktop slides in from the left,
  mobile rises as a bottom sheet.
- **Follow** (`state/store.tsx` → `toggleFollow`) — stored on
  `user.following: string[]`. Drives the constellation tab, the `f` shortcut
  (fly to first followed planet) and the `· following` marker in OrbitView.
- **Cargo / bookmarks** (`toggleSave`) — stored on `user.saved: string[]`;
  the bookmark button on every PostCard.
- **Profile editing** — OrbitView exposes name + bio edit on your own orbit.
- **Shortcuts** — arrows/WASD pan, `c` centre on me, `f` fly to first follow,
  Escape closes the topmost overlay (palette → console → composer → nova →
  menu → orbit panel).
- **Navigation invariant** — always use `goTo` in App, never raw `visit`:
  `goTo` also closes the console/menu so their backdrops cannot swallow the
  tap that opens the orbit panel. This was a real bug caught by the E2E suite.

## Verification

No test runner is wired into the repo. Bug-hunting is done with throwaway
`playwright-core` scripts (launch `/usr/bin/chromium` with
`--no-sandbox --disable-dev-shm-usage`) that drive the dev server and inspect
`localStorage`. Verify against both `http://localhost:12000/` and the work host.

Covered so far: mobile adaptation, canvas gestures, tap-to-open-orbit, supernova
threshold crossing and clearing, signals, logout/login round-trip, reset,
reload persistence, malformed handles, broken image URLs, like toggling,
inert post text, and the full email auth flow (signup, duplicate email, wrong
password, unknown email, invalid format, short password, unique handles,
demo-planet explore, link-email, mobile signup).

Against a **live Supabase** the suite also covers signup to planet row, satellite
creation and persistence, starring, follow, cargo, session restore on re-login,
duplicate-email refusal, the anonymous visitor path, and mobile layout. The
offline suite (`features.mjs`, `regress.mjs`) must stay green after any backend
change — it is what proves the localStorage fallback still works.

### Backend gotchas

- The splash screen keys off `ready` (first load finished), **not** `busy`.
  Gating it on `busy` unmounted the auth form mid-request and destroyed a failed
  sign-in's error message. Do not reintroduce that.
- Effects that clear their own trigger state must do so *inside* the timer, not
  before it — an early `clearInitialFocus()` cancelled its own cleanup and the
  visitor never flew to the picked planet.
- `signOut` fully tears down the remote session; the store resets to an empty
  galaxy rather than keeping stale rows around.
- Supabase's auth messages are translated to ORBIT's copy in the backend's
  `friendlyAuthError`; keep user-facing strings there, not in components.
- `enable_confirmations = true` means `signUp` returns no session and the store
  parks on the confirm screen (`pendingConfirmation`). Do not assume a signup
  yields a session — check `SignUpResult.status`. Anonymous visitors are exempt
  (`GOTRUE_SMS_AUTOCONFIRM`/anon users are never "unconfirmed"), so the demo
  path still enters directly.
- A config change needs the stack recreated *and* the new migration applied:
  `npx supabase stop && npx supabase start`, then `npx supabase migration up`.
  `start` alone re-applied the old migration set and silently skipped the new
  one. Verify with
  `docker exec supabase_db_project psql -U postgres -Atc "select proname from pg_proc where proname='handle_available'"`.

### Reaching the backend from the work host

The browser the user tests in is **not** on this machine, so `127.0.0.1` is not
this machine either. Anything the app talks to directly must go through the dev
server's own origin:

- `VITE_SUPABASE_URL=/sb`, proxied to `127.0.0.1:54321` (see `vite.config.ts`).
- The local mail catcher is `/mb` -> `127.0.0.1:54324`, read by `Mailbox.tsx`.
- `supabase/config.toml` must keep `site_url` / `additional_redirect_urls` on the
  work-host URL, or recovery links bounce to `localhost:3000`.
- Changing `config.toml` needs `npx supabase stop && npx supabase start` (the
  auth container reads it from the environment at creation). It takes a couple
  of minutes and applies the migration again.
- A hosted Supabase project short-circuits all of this: an absolute
  `VITE_SUPABASE_URL` is used as-is, and there is no catcher to show.

### Mail

There is no SMTP server locally. Supabase hands mail to a catcher (Inbucket) and
`Mailbox.tsx` renders it in-app, rewriting loopback links to `/sb`. Real delivery
needs SMTP configured in `config.toml` under `[auth.email.smtp]`, or a hosted
project with its own SMTP.

### Bringing the environment back up

The local stack runs in Docker, and a restarted container can come back with the
daemon gone — then every `/sb/...` request fails, the dev server logs
`ECONNREFUSED 127.0.0.1:54321`, and the app falls back to its error state while
the offline `LocalBackend` still works. Recover with, in order:

```bash
sudo service docker start      # or: dockerd &
npx supabase start             # a couple of minutes; re-applies the migration
npm run dev -- --port 12000
```

`npm test` does not need any of this; `npm run test:supabase` and
`npm run test:mail` do.

All three browser suites share `tests/harness.mjs`. It pre-sets the onboarding
flag before app scripts run, closes the orbit panel before clicking the footer,
and prefers `:visible` locators — the footer and mobile menu both render
`leave orbit`, and the hidden copy swallows clicks.

## Status

Email registration replaced nickname-only sign-in. Supabase is now wired in:
schema + RLS + triggers live in `supabase/migrations/`, the client layer in
`src/lib/backends/`, and the app runs against the shared galaxy whenever the two
`VITE_SUPABASE_*` vars are set.

Registration is a real, verified signup: display name, unique @handle (checked
against the `handle_available` RPC before submit), email, password with a
strength meter and a confirm field, and a rules checkbox. The address must then
be confirmed by mail before the planet can be signed into — `enable_confirmations
= true` in `config.toml`. An unverified sign-in lands on the "confirm your
address" screen rather than a dead end.

Password recovery works end to end (request -> in-app mailbox -> link -> new
password), verified from the public work host.

Without those vars the offline `LocalBackend` still applies, and there `src/lib/auth.ts`
hashes passwords in the browser — demo-grade, not real security. The offline
backend has no mail, so it skips the confirmation step entirely. Set the env vars
(and enable anonymous sign-ins) before calling any deployment production-ready.
