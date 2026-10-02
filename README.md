# ORBIT

A social network where every person is a **planet** and every post is a **satellite** in orbit around them.

There is no feed. You fly through a galaxy. The bigger a planet, the more the person has been
seen. The brighter a satellite, the more it resonated. Ten likes and a post detonates into a
**supernova** that lights up the whole galaxy for 24 hours.

---

## Live

- **Play (hosted demo):** https://chr0mat1x.github.io/newmysite/ — runs on the offline
  localStorage backend, so it needs no server and stays reachable indefinitely.
- **Source:** https://github.com/Chr0mat1x/newmysite

The hosted build is intentionally the offline one: sign up, post, react, and fly through the
galaxy entirely in your browser, with your own galaxy saved to `localStorage`. The shared
(multi-user) galaxy runs only where a Supabase backend is configured — see *Running* below.

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
VITE_BASE=/newmysite/ npm run build:pages
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
| Close any overlay | `Escape` |
| Sign in | pick a handle and a display name (no password — this is an MVP) |

Planets render procedurally from the user's name: ring system, surface texture, luminance, and glow
are all derived from a stable hash, so the same handle always produces the same world. ORBIT is
strictly monochrome, so a planet's identity comes from its **brightness and texture** rather than
its colour — obsidian worlds and bone-white ones sit side by side on the same black void. On the
launch screen you can pick which of eight worlds your seed resolves to.

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

Five tables: `planets`, `satellites`, `signals`, `stars` (likes) and nothing
else — follows and bookmarks are string arrays on the planet row.

- **Supernovae are a database concern.** A trigger on `stars` flips
  `satellites.supernova_at` when the 10th star lands, so the threshold cannot be
  spoofed by a modified client. The UI just reads the timestamp and fades the
  nova after 24 hours.
- **RLS everywhere.** Reads are public; writes are scoped to `auth.uid()`.
  A planet can only edit its own row, and a star can only be inserted with
  `planet = auth.uid()`.
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
