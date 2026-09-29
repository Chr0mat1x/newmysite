# ORBIT — repo memory

Social network where every user is a procedurally generated planet and each
post orbits them as a satellite. Monochrome space aesthetic.

## Commands

- `npm run dev` — Vite dev server. It must listen on **port 12000** so the work
  host proxy (`https://work-1-*.prod-runtime.all-hands.dev/`) reaches it.
- `npm run build` — `tsc --noEmit && vite build`. Must stay green.
- `npm run preview` — serve `dist/`.

## Stack

React 18 + TypeScript + Vite 5 + TailwindCSS 3 + Framer Motion. No backend:
all state lives in `localStorage` under `orbit.galaxy.v1`. The galaxy is one
`<canvas>` (2D context) driven by `requestAnimationFrame`.

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
- `src/state/store.tsx` — reducer + context. Single source of truth.
- `src/lib/` — `seed.ts` (mock galaxy), `procgen.ts` (planet sprites/hashing),
  `auth.ts` (email hashing/validation), `audio.ts` (procedural WebAudio),
  `storage.ts`, `useMedia.ts`, `math.ts`.
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

## Status

Email registration replaced nickname-only sign-in. Auth is local-only — there
is no server, `src/lib/auth.ts` hashes passwords in the browser, and this is
demo-grade, not real security. A production build needs a real backend.
