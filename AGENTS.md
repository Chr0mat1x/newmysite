# ORBIT — repo memory

Social network where every user is a procedurally generated planet and each
post orbits them as a satellite. Monochrome space aesthetic.

## Commands

- `npm run dev` — Vite dev server. It must listen on **port 12000** so the work
  host proxy (`https://work-1-*.prod-runtime.all-hands.dev/`) reaches it.
- `npm run build` — `tsc --noEmit && vite build`. Must stay green.
- `npm run preview` — serve `dist/`.
- `npm run relay:mail` — forward captured auth mail to a real inbox (see Mail).
- `npm test`, `npm run test:supabase`, `npm run test:mail` — the browser suites
  in `tests/` (see Verification).
- `npm run android:apk` — build the debug APK (see Android).
- `npm run build:pages` — offline bundle for GitHub Pages (`VITE_BASE` sets the subpath).
- `npm run build:online` — Pages bundle **with** a live Supabase backend from `.env.online` (accounts + email confirmation).
- `npm run deploy:pages` — build and publish to the live Pages branch. Offline demo by default; `ORBIT_ONLINE=1 npm run deploy:pages` ships the online build (see Hosting).

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
- **Messenger** (`components/Messenger.tsx`) — private transmissions, distinct
  from public *signals*. Two shapes share one panel: a **direct thread** (one
  peer) and a **cluster** (a named group). Reachable from the desktop footer
  (`messenger`), the phone toolbar (`mail`), the navigator, ⌘K, and a "send a
  private transmission" button on any real planet's orbit panel. Demo planets
  (`user.mock`) deliberately offer no such button — there is nobody to answer.
  A line may carry an **image** as well as text: the 📎 button reads a picked
  file through `lib/image.ts` (downscaled to a data URL, capped ~1280px/0.82
  JPEG) and it is stored in `messages.image` (`20261004120000_message_images.sql`
  adds the column and widens the body check to "body **or** image"). Same shape
  as a satellite image — a URL/data URL string, never a blob or a storage
  bucket — so `body` may be empty for an image-only line. Backed by `messages`
  (`20261002120000_messenger.sql`) and `clusters` + `cluster_members`
  (`20261003120000_clusters.sql`), all RLS-scoped; the anon key reads zero rows
  and cannot even call the membership helper.
- **Finding planets** — the messenger's search box looks up real planets by
  `@handle` or display name through the `planet_directory` RPC. Demo planets are
  returned flagged so the picker can grey them out (they have no reader). The
  lookup is debounced 250 ms and `execute` is revoked from `anon`, so the
  directory is only reachable by a signed-in planet.
- **Clusters** — created from the clusters tab: name the group, search and pick
  members, create. The creator is always a member (the `create_cluster` RPC
  inserts membership server-side, because RLS would otherwise refuse the first
  row). Open a cluster to read its lines, leave it, or tap a member chip to fly
  to that planet. `store.tsx` exposes `clusters`, `clusterMessages`,
  `clusterUnreadCount`, `searchPlanets`, `createCluster`, `sendClusterMessage`,
  `readCluster`, `leaveCluster` alongside the direct-thread API. Direct and
  cluster lines live in the same `messages` table: a cluster line has `cluster`
  set and `recipient` null, a direct line the reverse, and `mappers.ts` maps both.
- **Navigation invariant** — always use `goTo` in App, never raw `visit`:
  `goTo` also closes the console/menu so their backdrops cannot swallow the
  tap that opens the orbit panel. This was a real bug caught by the E2E suite.

## Verification

The suites live in `tests/` and run against a **live** server, driving
`playwright-core` (`/usr/bin/chromium`, `--no-sandbox --disable-dev-shm-usage`):

- `tests/core.mjs` (`npm test`) — offline/localStorage build: auth gate, planet
  sprites, validation, mobile layout, and an image-only transmission through the
  real `LocalBackend` (stored image, empty-body line, empty line refused).
- `tests/supabase.mjs` (`npm run test:supabase`) — the shared galaxy: signup,
  posting, stars, signals, follow, re-login, the anonymous visitor path, account
  settings, and `delete_me`.
- `tests/mail.mjs` (`npm run test:mail`) — the full mail flow off the local
  catcher (signup confirmation, recovery, email change).
- `tests/messenger.mjs` (`npm run test:messenger`) — two real planets exchanging
  private transmissions, and the privacy rule: the anon key must read zero
  `messages` rows.
- `tests/clusters.mjs` (`npm run test:clusters`) — three planets: search the
  directory by handle and by name, form a cluster, exchange lines, and confirm a
  non-member sees neither the cluster nor its lines. Also checks the anon key
  cannot call `planet_directory` or read `clusters`.

Pass `URL=https://<work-host>/` to point a suite at the work host; it defaults to
`http://localhost:12000/`. `tests/harness.mjs` holds the shared helpers — read it
before adding a suite. Because the galaxy only re-reads every 60s, a suite that
creates a second planet must `page.reload()` the first before searching for it.

`ALLOW_SELF_SIGNED=1` relaxes the browser's certificate check for the APK-parity
harness (below); leave it off otherwise so a real cert problem is never hidden.

Covered so far: mobile adaptation, canvas gestures, tap-to-open-orbit, supernova
threshold crossing and clearing, signals, logout/login round-trip, reset,
reload persistence, malformed handles, broken image URLs, like toggling,
inert post text, and the full email auth flow (signup, duplicate email, wrong
password, unknown email, invalid format, short password, unique handles,
demo-planet explore, link-email, mobile signup).

Assertions talk to Supabase directly where they can, so they verify rows actually
landed rather than trusting the UI. Private `messages` are RLS-scoped, so those
reads use the signed-in participant's token pulled from `localStorage`; a plain
anon-key read is *expected* to return zero rows (that is the privacy check).

## Android

The APK is a Capacitor shell (`capacitor.config.ts`, `android/`) around the same
React tree — there is no second implementation. `npm run android:apk` builds the
debug APK to `android/app/build/outputs/apk/debug/app-debug.apk`.

The one thing that differs from the web build is the backend URL: inside the
WebView there is no dev server, so the relative `/sb` proxy the browser uses does
not exist. `npm run build:android` therefore builds with `--mode android`, which
loads `.env.android` (git-ignored, generated from `.env.local`) and bakes in an
**absolute** Supabase URL.

`androidScheme: 'https'` in `capacitor.config.ts` is load-bearing: it makes the
WebView origin `https://localhost`, which the Supabase stack's CORS allows.
`capacitor://localhost` does **not** get an `Access-Control-Allow-Origin` header,
and the app would fail to link. Toolchain: JDK 21 plus the Android SDK
(`platform-tools`, `platforms;android-34`, `build-tools;34.0.0`); `ANDROID_HOME`
and `JAVA_HOME` must point at them.

To verify the actual artifact rather than the dev server, serve `dist/` over
`https://localhost` with an `/sb` proxy that does **not** follow redirects (GoTrue
returns the session in the URL fragment, which a server-side redirect would drop)
and run a suite against it with `ALLOW_SELF_SIGNED=1`. That path was used to run
the messenger suite green against the exact bundle shipped in the APK.

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
- `supabase/config.toml` must keep `site_url` / `additional_redirect_urls` on the
  work-host URL, or recovery links bounce to `localhost:3000`. **The work host
  changes every time the sandbox is recreated** (e.g. `work-1-<hash>...`), so on
  a fresh sandbox grep `config.toml` for a stale host and update both lines,
  otherwise confirmation mail carries a dead link. `RELAY_PUBLIC_BASE` in
  `.env.relay` needs the same host.
- Changing `config.toml` needs `npx supabase stop && npx supabase start` (the
  auth container reads it from the environment at creation). It takes a couple
  of minutes and applies the migration again.
- A hosted Supabase project short-circuits all of this: an absolute
  `VITE_SUPABASE_URL` is used as-is, and there is no catcher to show.

### Mail

There is no SMTP server locally: Supabase hands mail to a catcher (Inbucket) on
`127.0.0.1:54324`, which the browser cannot reach directly. The relay below
forwards that mail to a real inbox.

For mail to reach a real inbox, run the relay — it polls the catcher and
re-sends each message over real SMTP, rewriting the loopback links to the public
origin on the way out:

```bash
cp .env.relay.example .env.relay   # fill in a provider, then:
npm run relay:mail
```

`.env.relay` is gitignored, so credentials stay out of the repo. With no SMTP
settings the relay still runs and reports what it *would* forward, which makes it
useful as a diagnostic. `npm run test:relay` covers the rewriting, the MIME
building and a full SMTP delivery against a throwaway server; it needs a
captured message, so sign a planet up first.

Resend is wired up and verified end to end: signup → catcher → relay → real
inbox → click the link → signed in. Two things about it are worth knowing.

The onboarding sender (`onboarding@resend.dev`) only delivers to the address
that owns the Resend account, so `RELAY_FORWARD_TO` pins every message there.
Remove that line once a domain is verified and real recipients can be addressed
directly.

Resend requires STARTTLS on port 587. The SMTP client therefore has to parse a
*multi-line* EHLO reply: the whole capability list arrives in one TCP chunk, and
a reader that hands the caller only the first line loses `STARTTLS`, after which
the server rejects `AUTH` with `538 Must issue a STARTTLS command first`. That
was an intermittent failure until the reply accumulator was fixed; the client
now also refuses to send credentials whenever the server advertised STARTTLS but
the connection is still plaintext, and retries a failed send three times with
backoff. The tests pin all three behaviours down.

The alternative — `[auth.email.smtp]` in `config.toml` — also works, but the CLI
only interpolates `env(NAME)` when the variable is actually exported at the
moment `supabase` runs; otherwise `supabase status` fails with
`CliConfigParseError`. The relay avoids that sharp edge entirely.

### Going online (real users, real mail)

The local stack is for development only: it dies with the sandbox and its
catcher is unreachable from anyone else's machine. A shareable ORBIT needs a
hosted backend, and this is the whole path.

1. **Supabase project.** Create one at supabase.com. Project Settings -> API
   gives the project URL and the `anon` key.
2. **Schema.** `supabase link --project-ref <ref>` then `supabase db push` (or
   paste the files in `supabase/migrations/` into the SQL editor in filename
   order). This creates the tables, RLS and the `delete_me` / `handle_available`
   RPCs.
3. **SMTP.** Supabase's built-in sender is capped at 2 mails/hour and only
   delivers to the project team's own addresses, so real users get nothing.
   Configure a custom SMTP provider under Authentication -> Settings: any
   transactional provider (Resend, Brevo, SendGrid, SES) works. Free tiers are
   enough for a friends-and-family galaxy. Most providers require a **verified
   sending domain**; without one, Resend only mails the account owner and Brevo
   only mails the verified sender address.
4. **Redirect URLs.** Authentication -> URL Configuration: Site URL = the app's
   URL, and add it to the redirect allow-list **with its path and trailing
   slash** (e.g. `https://chr0mat1x.github.io/orbit/`). The app already sends
   `emailRedirectTo` from `appOrigin` in `src/lib/supabase.ts`; this step is what
   stops Supabase rejecting that redirect.
5. **Build + deploy.** Copy `.env.online.example` to `.env.online`, fill in the
   two values, then:
   ```bash
   ORBIT_ONLINE=1 npm run deploy:pages   # GitHub Pages at /orbit/
   # or, for the Android app talking to the same backend:
   npm run android:apk:online
   ```
   `android:apk:online` builds with `.env.online` (absolute Supabase URL, baked
   into the WebView) instead of the offline `.env.android`. That is the only
   thing that makes two phones share one galaxy.

Two gotchas this path exists to prevent:

- The app lives at `/orbit/` on Pages, so the redirect must include the path.
  Using a bare origin sent confirmations to the Pages root and 404'd; `appOrigin`
  fixes that and `npm run test:mail` pins it.
- `deploy:pages` in offline mode refuses to publish a bundle that contains a
  Supabase key. Online mode is the deliberate opposite; never put a *service*
  key in `.env.online` — only the anon key, which is public by design.

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

**ORBIT is live against a hosted backend.** Cloud project `hjxgljqjnllxgrqedjyj`
(region eu-west-2) holds the schema; the online build is deployed at
<https://chr0mat1x.github.io/orbit/> and the Android APK is attached to the
`v1.2.0` GitHub release. Two phones that install that APK, or two browsers on
that URL, share one galaxy: planets, posts, groups and private messages.

Online config, all set through the Management API (no dashboard clicking):

- Schema: all seven migrations in `supabase/migrations/` applied in filename
  order (`POST /v1/projects/<ref>/database/query` per file).
- Auth redirects: `site_url` and `uri_allow_list` include the `/orbit/` path,
  which the app sends from `appOrigin`.
- Mail: **custom SMTP is live**, so signup is a real email loop again —
  `mailer_autoconfirm = false`, and Supabase sends the confirmation through
  `smtp.yandex.ru` (port 587; 465 was rejected). Sender and `smtp_user` are the
  owner's Yandex address, an app password (not the account password). The
  confirmation and recovery templates are branded: the ORBIT logo from
  `public/brand/` served off Pages, black pill button, `{{ .ConfirmationURL }}`.
  A signup now returns no session until the link is opened — the app already
  renders its "confirm your address" screen for that, no client change needed.
  The built-in sender (2/hour, project-team addresses only) was unusable for
  real users, which is why this replaced it.
- `.env.online` (gitignored) holds the project URL and the anon key;
  `android:apk:online` bakes them into the WebView.

Verified against the cloud, not just locally: a UI signup on the deployed Pages
site created its planet, and a three-planet check confirmed private messages are
readable by their two participants and invisible to a third (RLS holds).

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

Password recovery works end to end (request -> mail -> link -> new password),
verified from the public work host.

`AccountSettings.tsx` closes the loop on account self-service, reachable from the
desktop footer (`account`) and the mobile navigator:

- **Email change** goes through `updateUser({ email })`. Supabase's secure change
  mails a confirmation to *both* the old and the new address, and the old one
  keeps working until the new inbox confirms — that is deliberate, so a typo
  cannot lock anyone out. Do not "fix" the duplicate mail.
- **Password change** re-authenticates with the current key first, because
  Supabase has no verify-current-password endpoint; a wrong current password
  fails the sign-in and nothing is written.
- **Sign out everywhere** uses `signOut({ scope: 'global' })`.
- **Delete planet** calls the `delete_me()` RPC (`20260930140000_account.sql`).
  `auth.users` is not writable with the anon key, so this `security definer`
  function is the one privileged operation ORBIT needs; it acts only on
  `auth.uid()`, drops the planet (satellites/signals/stars cascade), scrubs the
  id from other planets' `following`/`saved`, then deletes the auth user. It is
  granted to `authenticated` only — an anon call returns 401/42501.
  `deleteAccount` deliberately does **not** call `signOut` afterwards: the auth
  user is already gone, so the logout POST would 403 on a dead token and the
  console would carry a spurious error.

`minimum_password_length = 8` in `config.toml` now matches `PASSWORD_MIN`, so the
API rejects what the form would. The resend/`forgot` buttons sit on a 60s
cooldown (`RESEND_COOLDOWN`) to hold off the auth rate limiter.

The shared galaxy is currently **wiped of every registered account** (26 auth
users, including the email-registered ones, plus their planets and all content);
only the 12 seeded demo planets remain, so a fresh visitor still lands somewhere
populated. Signups start from zero again.

An Android APK exists (see Android) and the messenger is verified against the
exact bundle it ships.

Without those vars the offline `LocalBackend` still applies, and there `src/lib/auth.ts`
hashes passwords in the browser — demo-grade, not real security. The offline
backend has no mail, so it skips the confirmation step entirely; email and
password changes there take effect immediately, and `deleteAccount` purges the
user's row, satellites, signals and follows through the reducer. Set the env vars
(and enable anonymous sign-ins) before calling any deployment production-ready.

## Hosting (permanent links)

The work-host preview URLs die with the sandbox, so the demo also ships as
static builds on GitHub:

- **Demo:** https://chr0mat1x.github.io/orbit/
- **APK:** https://github.com/Chr0mat1x/newmysite/releases/latest
- **Source:** https://github.com/Chr0mat1x/newmysite

`npm run deploy:pages` builds the offline bundle and commits it into
`Chr0mat1x/Chr0mat1x.github.io` under `orbit/`. That repo already serves Pages,
so no site needs to be created. Do **not** switch it to a "GitHub Actions"
Pages source: the installation token cannot create a Pages site, so
`configure-pages` with `enablement: true` fails with
`Resource not accessible by integration`. The script commits to the existing
Pages branch instead, which needs no extra permission, and it refuses to deploy
if a Supabase URL or key leaked into the bundle.

The hosted demo is deliberately the **offline** build. `.env.pages` blanks the
backend vars (Vite loads `.env.<mode>` after `.env.local`), which both keeps the
shared-galaxy URL and anon key out of a public bundle and makes the demo
independent of any server. `.env.android` is blank for the same reason: the
released APK runs on-device and survives the sandbox.

### Email registration on the hosted site

Accounts and email confirmation need a **server that outlives the sandbox**, so
the offline Pages build cannot provide them — it has no backend at all. To turn
them on for `chr0mat1x.github.io/orbit/`:

1. Create a free Supabase project and push the migrations:
   `npx supabase link --project-ref <ref> && npx supabase db push`.
   Set the project's Auth URL config to the Pages origin so confirmation links
   point there (Site URL + `https://chr0mat1x.github.io/orbit/` in Redirect URLs).
2. `cp .env.online.example .env.online` and fill in the project URL + anon key.
   The anon key is safe in a web bundle — RLS is the real guard — but keeping it
   out of the repo keeps the project ref private.
3. `ORBIT_ONLINE=1 npm run deploy:pages`.

The online build bakes an **absolute** Supabase URL, so it never relies on the
dev-server `/sb` proxy. Without a hosted project the main site stays on the
offline demo; `.env.online` is gitignored, so this step is the only thing that
switches it over.
