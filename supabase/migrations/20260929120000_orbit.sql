-- ORBIT schema: every user is a planet, every post a satellite, every comment a
-- signal, every like a star. RLS is on for every table, so the public anon key
-- can read the galaxy but only ever write rows that belong to the caller.

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table if not exists public.planets (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,
  name text not null,
  bio text not null default '',
  seed bigint not null default 0,
  following uuid[] not null default '{}',
  saved uuid[] not null default '{}',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- Real planets reuse their auth user id (the signup trigger inserts it); demo
-- planets get a generated one. There is deliberately no FK to auth.users so the
-- seeded fleet can exist without accounts — ownership is enforced by RLS below.

create table if not exists public.satellites (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references public.planets (id) on delete cascade,
  body text not null default '',
  image text,
  kind text not null default 'text' check (kind in ('text', 'image')),
  supernova_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  satellite uuid not null references public.satellites (id) on delete cascade,
  author uuid not null references public.planets (id) on delete cascade,
  body text not null,
  phase double precision not null default 0,
  created_at timestamptz not null default now()
);

-- stars is a join table rather than an array column on satellites: two people
-- liking the same post at the same moment can never overwrite each other.
create table if not exists public.stars (
  satellite uuid not null references public.satellites (id) on delete cascade,
  planet uuid not null references public.planets (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (satellite, planet)
);

create index if not exists satellites_author_idx on public.satellites (author, created_at desc);
create index if not exists signals_satellite_idx on public.signals (satellite, created_at);
create index if not exists signals_author_idx on public.signals (author);
create index if not exists stars_planet_idx on public.stars (planet);

-- ---------------------------------------------------------------------------
-- the supernova rule lives in the database
-- ---------------------------------------------------------------------------
-- A post detonates the moment its tenth star lands and stays visible galaxy-wide
-- for 24h, then fades. Both edges are computed from the true star count, so the
-- rule holds no matter how many clients race to like at once. The function is
-- SECURITY DEFINER because `satellites` no longer grants clients an update path.

create or replace function public.sync_supernova()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sat uuid := coalesce(new.satellite, old.satellite);
  stars int;
begin
  select count(*) into stars from public.stars where satellite = sat;
  update public.satellites
     set supernova_at = case
           when stars >= 10 then coalesce(supernova_at, now())
           else null
         end
   where id = sat;
  return null;
end;
$$;

drop trigger if exists stars_supernova on public.stars;
create trigger stars_supernova
  after insert or delete on public.stars
  for each row execute function public.sync_supernova();

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

-- new planets reserve a handle automatically; if the requested one is taken a
-- numeric suffix is appended, exactly like the browser used to do
create or replace function public.unique_handle(desired text)
returns text
language plpgsql
stable
as $$
declare
  base text := nullif(regexp_replace(lower(coalesce(desired, '')), '[^a-z0-9_]', '', 'g'), '');
  candidate text;
  n int := 1;
begin
  if base is null then base := 'traveler'; end if;
  base := left(base, 20);
  candidate := base;
  while exists (select 1 from public.planets p where p.handle = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.planets enable row level security;
alter table public.satellites enable row level security;
alter table public.signals enable row level security;
alter table public.stars enable row level security;

drop policy if exists "planets are readable" on public.planets;
create policy "planets are readable" on public.planets for select using (true);

drop policy if exists "satellites are readable" on public.satellites;
create policy "satellites are readable" on public.satellites for select using (true);

drop policy if exists "signals are readable" on public.signals;
create policy "signals are readable" on public.signals for select using (true);

drop policy if exists "stars are readable" on public.stars;
create policy "stars are readable" on public.stars for select using (true);

-- a planet may only edit its own record
drop policy if exists "own planet is writable" on public.planets;
create policy "own planet is writable" on public.planets
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- satellites: the author owns the row outright
drop policy if exists "satellites are insertable by author" on public.satellites;
create policy "satellites are insertable by author" on public.satellites
  for insert with check (auth.uid() = author);

drop policy if exists "satellites are deletable by author" on public.satellites;
create policy "satellites are deletable by author" on public.satellites
  for delete using (auth.uid() = author);

drop policy if exists "satellites are updatable by author" on public.satellites;
create policy "satellites are updatable by author" on public.satellites
  for update using (auth.uid() = author) with check (auth.uid() = author);

drop policy if exists "signals are insertable by author" on public.signals;
create policy "signals are insertable by author" on public.signals
  for insert with check (auth.uid() = author);

drop policy if exists "signals are deletable by author" on public.signals;
create policy "signals are deletable by author" on public.signals
  for delete using (auth.uid() = author);

drop policy if exists "stars are insertable by owner" on public.stars;
create policy "stars are insertable by owner" on public.stars
  for insert with check (auth.uid() = planet);

drop policy if exists "stars are deletable by owner" on public.stars;
create policy "stars are deletable by owner" on public.stars
  for delete using (auth.uid() = planet);

-- ---------------------------------------------------------------------------
-- planet rows, created automatically on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_planet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired text;
  gm text;
  final_handle text;
begin
  desired := new.raw_user_meta_data ->> 'handle';
  if desired is null or desired = '' then
    desired := split_part(coalesce(new.email, 'traveler'), '@', 1);
  end if;
  final_handle := public.unique_handle(desired);
  gm := nullif(new.raw_user_meta_data ->> 'seed', '');
  insert into public.planets (id, handle, name, bio, seed)
  values (
    new.id,
    final_handle,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), final_handle),
    coalesce(new.raw_user_meta_data ->> 'bio', 'Just entered the galaxy.'),
    coalesce(gm::bigint, 0)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_planet();

-- ---------------------------------------------------------------------------
-- demo galaxy
-- ---------------------------------------------------------------------------
-- Seeded planets are real rows owned by nobody, so the demo fleet shows up for
-- every visitor while remaining read-only. Idempotent: a populated galaxy is
-- left untouched.

create or replace function public.seed_demo_galaxy()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demos constant text[][] := array[
    ['nova', 'Nova Ashkar'], ['vela', 'Vela Рина'], ['kepler', 'Kepler Ng'],
    ['lyra', 'Lyra Sørensen'], ['atlas', 'Atlas Bek'], ['mira', 'Mira Okonkwo'],
    ['orion', 'Orion Vasquez'], ['solen', 'Solen Farid'], ['iris', 'Iris Lindqvist'],
    ['cael', 'Cael Moreau'], ['zeta', 'Zeta Amaral'], ['kappa', 'Kappa Ильин']
  ];
  bios constant text[] := array[
    'I collect quiet moments and loud colours.',
    'Astrophotographer. Sleeping in the desert.',
    'Exoplanet hunter by day, synth wizard by night.',
    'Making playlists for long drives on Europa.',
    'Weightlifting heavy things and heavy thoughts.',
    'Painter of impossible skies.',
    'I argue with telescopes for a living.',
    'Ceramics, tea, and gravity.',
    'Science fiction is just paperwork for the future.',
    'Rooftop gardener. Failed astronaut.',
    'Drummer. I keep time with the moons.',
    'Cold water swimmer in a warm universe.'
  ];
  texts constant text[] := array[
    'tonight the sky looked like a screensaver someone forgot to turn off.',
    'there is a specific blue that only exists at 5:47am. i have been chasing it for years.',
    'the satellite passed over my house twice tonight. i waved both times.',
    'somewhere out there, a version of me is asleep and on time.',
    'if you are reading this, you survived another orbit. well done.',
    'seven hours of work for four seconds of good footage. worth it.',
    'i do not miss people, i miss the way they said my name.',
    'saw a fox at 3am. neither of us said anything.',
    'everyone is somebody''s distant light. i like that.',
    'the moon tonight is doing something dramatic. look up.',
    'rain on a tin roof is the only reliable lullaby.',
    'some constellations are just five dots and a lot of faith.'
  ];
  images constant text[] := array[
    'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
    'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=900&q=70',
    'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70',
    'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70',
    'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70',
    'https://images.unsplash.com/photo-1465101162946-4377e57745c3?w=900&q=70'
  ];
  pid uuid;
  sid uuid;
  ids uuid[] := '{}';
  i int;
  j int;
  k int;
  n int;
  pname text;
  phandle text;
begin
  if exists (select 1 from public.planets) then return; end if;

  -- pass 1 — every planet first, so star arrays below can reference them all
  for i in 1 .. array_length(demos, 1) loop
    phandle := demos[i][1];
    pname := demos[i][2];
    insert into public.planets (id, handle, name, bio, seed, is_demo, created_at)
    values (
      gen_random_uuid(),
      phandle,
      pname,
      bios[i],
      (abs(hashtext(phandle)))::bigint,
      true,
      now() - (60 + i) * interval '1 day'
    )
    returning id into pid;
    ids := ids || pid;
  end loop;

  -- pass 2 — satellites, their stars, and the signals orbiting them
  for i in 1 .. array_length(demos, 1) loop
    pid := ids[i];
    phandle := demos[i][1];

    n := 3 + (abs(hashtext(phandle || 'n')) % 4);
    for j in 1 .. n loop
      insert into public.satellites (author, body, image, kind, created_at)
      values (
        pid,
        texts[1 + ((abs(hashtext(phandle || j::text)) + i) % array_length(texts, 1))],
        case when abs(hashtext(phandle || 'i' || j::text)) % 3 = 0
             then images[1 + (abs(hashtext(phandle || j::text)) % array_length(images, 1))] end,
        case when abs(hashtext(phandle || 'i' || j::text)) % 3 = 0 then 'image' else 'text' end,
        now() - (abs(hashtext(phandle || 'd' || j::text)) % 12) * interval '1 day'
      )
      returning id into sid;

      -- a hand-made minority of satellites are already burning
      if i % 4 = 1 and j = 1 then
        insert into public.stars (satellite, planet)
        select sid, unnest(ids[1:10])
        on conflict do nothing;
      end if;

      for k in 1 .. (abs(hashtext(sid::text)) % 3) loop
        insert into public.signals (satellite, author, body, phase, created_at)
        values (
          sid,
          ids[1 + (abs(hashtext(sid::text || k::text)) % array_length(ids, 1))],
          (array['beautiful', 'i felt this', 'same energy', 'underrated post', 'wow', 'needed this today'])[1 + (abs(hashtext(sid::text || k::text)) % 6)],
          (abs(hashtext(sid::text || 'ph' || k::text)) % 628) / 100.0,
          now() - (abs(hashtext(sid::text || 'sd' || k::text)) % 4) * interval '1 day'
        );
      end loop;
    end loop;
  end loop;
end;
$$;

select public.seed_demo_galaxy();
