# ORBIT

A social network where every person is a **planet** and every post is a **satellite** in orbit around them.

There is no feed. You fly through a galaxy. The bigger a planet, the more the person has been
seen. The brighter a satellite, the more it resonated. Ten likes and a post detonates into a
**supernova** that lights up the whole galaxy for 24 hours.

---

## Live

- **Play (hosted demo):** https://chr0mat1x.github.io/orbit/ — runs on the offline
  localStorage backend, so it needs no server and stays reachable indefinitely.
- **Android app:** https://github.com/Chr0mat1x/newmysite/releases/latest — download the
  APK, open it on the phone, allow installation from unknown sources.
- **Source:** https://github.com/Chr0mat1x/newmysite

The hosted demo is intentionally the offline build: sign up, post, react, message, and fly
through the galaxy entirely on your device, with your galaxy saved to `localStorage`.

Accounts with **email confirmation** and the shared (multi-user) galaxy need a Supabase
backend that outlives any preview host. The code is ready for it — set `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY` (see `.env.online.example`) and build with `npm run build:online`.
Until that project exists, the main site stays on the offline demo. See *Running* below.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Build and preview a production bundle:

```bash
npm run build
npm run preview
```

Build the offline bundle for GitHub Pages (blank backend vars, `VITE_BASE` as the subpath):

```bash
VITE_BASE=/orbit/ npm run build:pages
```

Build the Android APK (offline build; point `.env.android` at a real Supabase project first
if you want the shared galaxy):

```bash
npm run android:apk    # android/app/build/outputs/apk/debug/app-debug.apk
```

Type-check only:

```bash
npm run typecheck
```

The dev server binds `0.0.0.0` and accepts any host, so it works behind a forwarded/preview URL.
Set `PORT=12000 npm run dev` to pin the port.

---

## How it plays

| Action | Control |
| --- | --- |
| Fly / roam | drag the canvas, or `W A S D` / arrow keys |
| Zoom | mouse wheel / pinch, or the `+` / `−` buttons |
| Visit a planet | click it on the canvas, or click its node in the mini-map |
| Fly home | `C`, or your name in the top bar |
| Launch a satellite | `+ SATELLITE`, or `N` |
| Open the messenger | the `messenger` / `mail` button, or `⌘K` |
| Close any overlay | `Escape` |
| Sign in | display name, handle, email and password — email confirmation required |

Planets render procedurally from the user's name: ring system, surface texture, luminance, and glow
are all derived from a stable hash, so the same handle always produces the same world. ORBIT is
strictly monochrome, so a planet's identity comes from its **brightness and texture** rather than
its colour — obsidian worlds and bone-white ones sit side by side on the same black void. On the
launch screen you can pick which of eight worlds your seed resolves to.

### Messenger

Private **transmissions** sit apart from public *signals*. Two shapes share one panel:

- **Direct thread** — message one planet. Search the galaxy by `@handle` or name to find them.
- **Cluster** — a named group. Search and pick members, create, and everyone in it sees the lines.

Open the messenger from the footer (`messenger`), the phone toolbar (`mail`), the navigator, or
`⌘K`. Demo planets are greyed out in search — they have no reader behind them. Opening a
conversation clears its unread badge; the toolbar badge counts direct and cluster unread together.

### Supernovae

A post with 10+ stars turns into a supernova: it flares into white plasma, appears in the
galaxy-wide **nova** feed for 24 hours, and gets linked to other hot planets by faint constellation
lines. This is the discovery mechanism — there is no algorithmic feed.

---

## Stack

- **React + Vite + TypeScript**
- **TailwindCSS** for layout and chrome
- **Framer Motion** for overlay and card transitions
- **Canvas 2D** for the galaxy engine (starfield parallax, planets, orbit lanes, satellites, FX)

The palette is intentionally black-and-white. Post imagery is rendered through a `grayscale`
filter and the procedural engine emits only achromatic values (`hsla(0,0%,L%,A)`), so the whole
frame stays neutral except for sub-pixel antialiasing.

All state sits behind a single `Backend` interface (`src/lib/backends/`). Two
implementations ship in the repo and the app picks one at build time:

- **`LocalBackend`** — `localStorage`, a complete single-browser product with no
  server. This is the default when no Supabase env vars are set.
- **`SupabaseBackend`** — real auth and a shared Postgres galaxy with RLS,
  triggers and a seeded demo fleet. Used when `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` are present.

The React tree never talks to a database directly; it calls the store, and the
store calls whichever backend is live.

---

## Running

```bash
npm install
npm run dev          # http://localhost:12000 — offline demo, no setup needed
```

To run against a real backend you need Supabase. The quickest path is the local
stack (requires Docker):

```bash
npx supabase start   # boots Postgres, Auth, REST and Studio in containers
cp .env.example .env.local
# paste the API URL + anon key printed by `supabase start`
npm run dev
```

The migration in `supabase/migrations/` creates the schema, the RLS policies,
the signup trigger (every auth user gets a planet) and `seed_demo_galaxy()` —
the same demo fleet the offline build ships with.

For production, create a Supabase project, run the migration against it, then
set the two env vars in your host (Vercel/Netlify). Enable **anonymous sign-ins**
in Auth settings: ORBIT uses them for the "explore a demo planet" visitor path,
where a visitor gets a throwaway planet they can later attach an email to.

To host ORBIT on **GitHub Pages** with accounts and email confirmation, use the
online build instead of the offline demo:

```bash
cp .env.online.example .env.online   # fill in the hosted project URL + anon key
ORBIT_ONLINE=1 npm run deploy:pages  # builds build:online and pushes to /orbit/
```

Email confirmation links point wherever the Supabase project's **Site URL** is
set, so set that (and the Redirect URLs) to the Pages origin before deploying.
`.env.online` is gitignored; without it the main site stays on the offline demo.

---

## Project structure

```
src/
  engine/
    Starfield.ts      4 parallax star layers + world-locked nebulae
    layout.ts         golden-angle spiral placement of planets
    GalaxyCanvas.ts   the engine: camera, flight easing, draw passes, hit-testing
  components/
    GalaxyCanvas.tsx  React driver around the engine (pointer, wheel, stats)
    AuthGate.tsx      sign up / sign in / explore demo planets
    OrbitView.tsx     a planet's orbit: posts, stars, signals
    PostCard.tsx      one satellite
    Composer.tsx      launch a new post (text + image URL)
    SupernovaFeed.tsx galaxy-wide supernova list
    MiniMap.tsx       whole-galaxy overview and fast travel
    Toasts.tsx        in-app notifications
    Onboarding.tsx    first-run walkthrough
  lib/
    procgen.ts        hashing + seeded RNG + planet generation
    seed.ts           demo galaxy (users, posts, signals, supernovae)
    storage.ts        localStorage load/save (used by the offline backend)
    audio.ts          ambient drone + interaction pings (WebAudio)
    math.ts           lerp / clamp / easing
    supabase.ts       client + `isRemote` switch + link status type
    mappers.ts        DB rows <-> domain types
    backends/
      types.ts        the Backend interface
      local.ts        offline implementation (localStorage)
      supabase.ts     remote implementation (Auth + Postgres + RLS)
  state/
    reducer.ts        pure state transitions, shared by the store
    store.tsx         context, async actions, derived selectors
  App.tsx             HUD and screen composition
supabase/
  config.toml         local stack config (anonymous sign-ins enabled)
  migrations/         schema, RLS, triggers, demo seeder
```

---

## Backend model

Tables: `planets`, `satellites`, `signals`, `stars` (likes), plus `messages`,
`clusters` and `cluster_members` for the messenger — follows and bookmarks are
string arrays on the planet row.

- **Supernovae are a database concern.** A trigger on `stars` flips
  `satellites.supernova_at` when the 10th star lands, so the threshold cannot be
  spoofed by a modified client. The UI just reads the timestamp and fades the
  nova after 24 hours.
- **RLS everywhere.** Reads are public; writes are scoped to `auth.uid()`.
  A planet can only edit its own row, and a star can only be inserted with
  `planet = auth.uid()`. Direct messages and clusters are the exception — only
  the participants (or cluster members) can read them, and the public anon key
  reads zero rows.
- **Groups are created server-side.** A cluster's first membership row would be
  refused by RLS (the creator is not yet a member), so `create_cluster` inserts
  the cluster and its members in one call, and only signed-in planets may run it.
- **Visitors are anonymous auth users.** The signup trigger gives them a real
  planet (from the metadata passed at sign-in), so they can post and react
  without an account and can upgrade later.

---

## Notes for a real deployment

- Audio starts muted and unmutes on the first gesture (browser autoplay policy).
- The store re-reads the affected tables after each write rather than patching
  its cache. Fine for a demo-sized galaxy; revisit if ORBIT ever holds thousands
  of satellites.
- Deploy the frontend to Vercel or Netlify and run the migration against a
  hosted Supabase project. Nothing else is required.
