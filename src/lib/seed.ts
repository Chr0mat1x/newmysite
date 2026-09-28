/** A hand-curated, seeded mock galaxy so the demo feels alive on first launch. */

import type { GalaxyState, Post, User } from '../types'
import { hashString } from './procgen'
import { uid, SEED_VERSION } from './storage'

interface SeedUser {
  handle: string
  name: string
  bio: string
}

const SEED_USERS: SeedUser[] = [
  { handle: 'nova', name: 'Nova Ashkar', bio: 'I collect quiet moments and loud colours.' },
  { handle: 'vela', name: 'Vela Рина', bio: 'Astrophotographer. Sleeping in the desert.' },
  { handle: 'kepler', name: 'Kepler Ng', bio: 'Exoplanet hunter by day, synth wizard by night.' },
  { handle: 'lyra', name: 'Lyra Sørensen', bio: 'Making playlists for long drives on Europa.' },
  { handle: 'atlas', name: 'Atlas Bek', bio: 'Weightlifting heavy things and heavy thoughts.' },
  { handle: 'mira', name: 'Mira Okonkwo', bio: 'Painter of impossible skies.' },
  { handle: 'orion', name: 'Orion Vasquez', bio: 'I argue with telescopes for a living.' },
  { handle: 'solen', name: 'Solen Farid', bio: 'Ceramics, tea, and gravity.' },
  { handle: 'iris', name: 'Iris Lindqvist', bio: 'Science fiction is just paperwork for the future.' },
  { handle: 'cael', name: 'Cael Moreau', bio: 'Rooftop gardener. Failed astronaut.' },
  { handle: 'zeta', name: 'Zeta Amaral', bio: 'Drummer. I keep time with the moons.' },
  { handle: 'kappa', name: 'Kappa Ильин', bio: 'Cold water swimmer in a warm universe.' },
  { handle: 'lumen', name: 'Lumen Díaz', bio: 'Lighting designer. Everything is a gradient.' },
  { handle: 'occus', name: 'Occus Rahal', bio: 'Mapping dark matter with spreadsheets.' },
  { handle: 'petra', name: 'Petra Lindgren', bio: 'Rocks. Big ones. Volcanic ones.' },
  { handle: 'sable', name: 'Sable Okoye', bio: 'Analog film, digital heart.' },
  { handle: 'titan', name: 'Titan Rhodes', bio: 'Building a cabin with my own hands.' },
  { handle: 'umbra', name: 'Umbra Sato', bio: 'Night shift nurse. Sunrises are a hobby.' },
  { handle: 'vega', name: 'Vega Halvorsen', bio: 'Sound designer for imaginary films.' },
  { handle: 'wren', name: 'Wren Castellanos', bio: 'Poems about bus stops and black holes.' },
  { handle: 'xen', name: 'Xen Park', bio: 'Chess, coffee, and cold logic.' },
  { handle: 'yuki', name: 'Yuki Brand', bio: 'Snowboarder chasing powder across planets.' },
  { handle: 'zeno', name: 'Zeno Marchetti', bio: 'Philosopher of small scales.' },
  { handle: 'aero', name: 'Aero Kovács', bio: 'Paragliding instructor. Gravity is a suggestion.' },
  { handle: 'borealis', name: 'Borealis Hunt', bio: 'I chase auroras and tell bad jokes.' },
  { handle: 'cygni', name: 'Cygni Ferreira', bio: 'Illustrator. I draw what telescopes miss.' },
  { handle: 'draco', name: 'Draco Ibrahim', bio: 'Parkour, bread baking, chaos.' },
  { handle: 'ember', name: 'Ember Solano', bio: 'Wildfire photographer. Sorry, not sorry.' },
  { handle: 'fable', name: 'Fable Rossi', bio: 'Children\'s book author who never grew up.' },
  { handle: 'glint', name: 'Glint Haddad', bio: 'Lapidary. I make gems out of rubble.' },
  { handle: 'helio', name: 'Helio Nakamura', bio: 'Solar engineer. Powered by the actual sun.' },
  { handle: 'io', name: 'Io Petrova', bio: 'Volcanologist. Everything is temporary.' },
  { handle: 'juno', name: 'Juno Alvarez', bio: 'Mother, mechanic, midnight baker.' },
  { handle: 'kelp', name: 'Kelp Andersen', bio: 'Underwater gardener. Breathe slow.' },
  { handle: 'lucid', name: 'Lucid Tamm', bio: 'Sleep researcher documenting my own dreams.' },
  { handle: 'monsoon', name: 'Monsoon Devi', bio: 'Storm chaser. Wind is my coworker.' },
]

const POST_TEXT = [
  'tonight the sky looked like a screensaver someone forgot to turn off.',
  'i finally understood why sailors were afraid of the sea. it is the same reason pilots are afraid of the sky.',
  'made soup. it was terrible. i am still proud.',
  'there is a specific blue that only exists at 5:47am. i have been chasing it for years.',
  'deleted three drafts and wrote this instead. hi.',
  'the satellite passed over my house twice tonight. i waved both times.',
  'somewhere out there, a version of me is asleep and on time.',
  'i keep buying books about the ocean. i have never seen the ocean.',
  'if you are reading this, you survived another orbit. well done.',
  'my neighbour plays piano at 11pm and honestly? it is improving.',
  'found a rock today that looked exactly like the moon. kept it.',
  'the fog came in so low the streetlights looked like they were underwater.',
  'seven hours of work for four seconds of good footage. worth it.',
  'i do not miss people, i miss the way they said my name.',
  'there is a plant on my windowsill that has outlived two relationships.',
  'saw a fox at 3am. neither of us said anything.',
  'learning to sit still is the hardest skill i have ever attempted.',
  'the radio played the same song in three different countries. coincidence is loud.',
  'i am not lost, i am just at an altitude i did not plan for.',
  'bought a telescope instead of a couch. no regrets, sore back.',
  'the cake collapsed. the frosting was fine. we ate it anyway.',
  'everyone is somebody\'s distant light. i like that.',
  'took the long way home and accidentally found my favourite street.',
  'my hands smell like soil and i am unreasonably happy about it.',
  'the moon tonight is doing something dramatic. look up.',
  'traded sleep for silence. decent exchange rate.',
  'i wrote a letter i will never send. it was a good letter.',
  'the trail was closed so i just sat at the gate and listened.',
  'i have decided that 2026 is the year of the small brave thing.',
  'my dog does not care about exoplanets. i respect that deeply.',
  'rain on a tin roof is the only reliable lullaby.',
  'the espresso machine broke. we are all grieving in our own way.',
  'some constellations are just five dots and a lot of faith.',
  'i am slowly becoming a person who owns too many mugs.',
  'the ferry was late. the sunset was not. balance.',
  'tonight i will sleep like a rock in orbit. heavy and calm.',
]

const IMAGES = [
  'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
  'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=900&q=70',
  'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70',
  'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70',
  'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70',
  'https://images.unsplash.com/photo-1435224668334-0f82ec57b605?w=900&q=70',
  'https://images.unsplash.com/photo-1465101162946-4377e57745c3?w=900&q=70',
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=900&q=70',
  'https://images.unsplash.com/photo-1462332420958-a05d1e002413?w=900&q=70',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&q=70',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=900&q=70',
  'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=900&q=70',
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=900&q=70',
  'https://images.unsplash.com/photo-1504333638930-c8787321eee0?w=900&q=70',
  'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=900&q=70',
  'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=900&q=70',
  'https://images.unsplash.com/photo-1464802686167-b939a6910659?w=900&q=70',
  'https://images.unsplash.com/photo-1454789548928-9efd52dc4031?w=900&q=70',
]

/** small deterministic PRNG so the demo galaxy is identical on every device */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

export function buildSeedGalaxy(): GalaxyState {
  const users: Record<string, User> = {}
  const posts: Record<string, Post> = {}
  const now = Date.now()

  SEED_USERS.forEach((s, i) => {
    const id = `u_${s.handle}`
    users[id] = {
      id,
      handle: s.handle,
      name: s.name,
      bio: s.bio,
      seed: hashString(s.handle),
      createdAt: now - (60 + i) * 86400000,
      mock: true,
    }
  })

  const ids = Object.keys(users)
  ids.forEach((authorId, ui) => {
    const r = rng(hashString(authorId) + 7)
    const count = 3 + Math.floor(r() * 5)
    const offset = Math.floor(r() * POST_TEXT.length)
    // only a handful of planets are "burning" — supernovae must stay rare
    const isNovaPlanet = ui % 9 === 4
    for (let i = 0; i < count; i++) {
      const pid = uid()
      const hasImage = r() > 0.45
      const forceNova = isNovaPlanet && i === 0
      // non-nova posts stay comfortably under the threshold so supernovae are earned, not ambient
      const likes = forceNova
        ? 10 + Math.floor(r() * 14)
        : Math.floor(Math.pow(r(), 2.6) * 8.6)
      const likers: string[] = []
      for (let l = 0; l < likes; l++) likers.push(ids[Math.floor(r() * ids.length)])
      const signalCount = Math.floor(r() * 5)
      const signals = Array.from({ length: signalCount }, () => ({
        id: uid(),
        authorId: ids[Math.floor(r() * ids.length)],
        text: ['beautiful', 'i felt this', 'same energy', 'underrated post', 'wow', 'needed this today'][
          Math.floor(r() * 6)
        ],
        createdAt: now - Math.floor(r() * 4 * 86400000),
        phase: r() * Math.PI * 2,
      }))
      posts[pid] = {
        id: pid,
        authorId,
        text: POST_TEXT[(offset + i * 3) % POST_TEXT.length],
        image: hasImage ? IMAGES[Math.floor(r() * IMAGES.length)] : undefined,
        createdAt: now - Math.floor(r() * 12 * 86400000) - i * 3600000,
        likes: likers,
        signals,
        supernovaAt: likers.length >= 10 ? now - Math.floor(r() * 6 * 3600000) : null,
        kind: hasImage ? 'image' : 'text',
      }
    }
  })

  return { version: 1, seedVersion: SEED_VERSION, users, posts, currentUserId: null }
}

/**
 * Builds the seed a user's planet is generated from. In monochrome, colour no
 * longer distinguishes worlds, so a chosen variant folds into the seed to select
 * luminance + texture instead. Everything downstream (engine, badges) reads
 * `user.seed`, so they stay in sync automatically.
 */
export function planetSeed(handle: string, name: string, variant = 0): number {
  const clean = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
  return hashString(`${clean}::${name.trim()}::${variant}`)
}

export function makeUser(handle: string, name: string, planetVariant = 0): User {
  const clean = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
  return {
    id: `me_${clean || uid()}`,
    handle: clean || 'traveler',
    name: name.trim() || clean || 'Traveler',
    bio: 'Just entered the galaxy.',
    seed: planetSeed(handle, name || handle, planetVariant),
    createdAt: Date.now(),
    mock: false,
  }
}
