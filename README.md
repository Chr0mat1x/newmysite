# ORBIT

A social network where every person is a **planet** and every post is a **satellite** in orbit around them.

There is no feed. You fly through a galaxy. The bigger a planet, the more the person has been
seen. The brighter a satellite, the more it resonated. Ten likes and a post detonates into a
**supernova** that lights up the whole galaxy for 24 hours.

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

Planets render procedurally from the user's name: hue, ring system, surface banding, and glow are
all derived from a stable hash, so the same handle always produces the same world.

### Supernovae

A post with 10+ stars turns into a supernova: it is drawn with magenta plasma, appears in the
galaxy-wide **nova** feed for 24 hours, and gets linked to other hot planets by faint constellation
lines. This is the discovery mechanism — there is no algorithmic feed.

---

## Stack

- **React + Vite + TypeScript**
- **TailwindCSS** for layout and chrome
- **Framer Motion** for overlay and card transitions
- **Canvas 2D** for the galaxy engine (starfield parallax, planets, orbit lanes, satellites, FX)

All state lives in `localStorage` behind a single reducer, so the app is a complete product
without a backend. Swapping in Supabase means replacing `src/lib/storage.ts` and the load/save
calls in `src/state/store.tsx` — nothing else touches persistence.

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
    AuthGate.tsx      handle + display name entry
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
    storage.ts        localStorage load/save
    audio.ts          ambient drone + interaction pings (WebAudio)
    math.ts           lerp / clamp / easing
  state/store.tsx     single reducer + context + persistence
  App.tsx             HUD and screen composition
```

---

## Notes for a real deployment

- Persistence is per-browser. Two people on two machines will not see each other yet.
- Audio starts muted and unmutes on the first gesture (browser autoplay policy).
- Recommended path to a live beta: keep this UI, add Supabase auth + tables
  (`users`, `posts`, `likes`, `signals`), and replace the reducer's save/load layer.
  Deploy the frontend to Vercel or Netlify.
