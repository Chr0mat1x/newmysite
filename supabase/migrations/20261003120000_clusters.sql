-- ---------------------------------------------------------------------------
-- clusters (group transmissions) + planet directory search
-- ---------------------------------------------------------------------------
-- The messenger grew a second shape: alongside a two-party thread there is now
-- a named group ("cluster") with a member list. A message is therefore either
-- direct (recipient set, cluster null) or a cluster line (cluster set, recipient
-- null) — never both, which is what the check below enforces. Keeping the two
-- shapes in one table means the existing direct-thread code and its index keep
-- working untouched.

create table if not exists public.clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  creator uuid not null references public.planets (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.cluster_members (
  cluster uuid not null references public.clusters (id) on delete cascade,
  planet uuid not null references public.planets (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (cluster, planet)
);

-- the messages table predates clusters, so relax the recipient column and add
-- the cluster side rather than rebuilding the table
alter table public.messages
  alter column recipient drop not null;
alter table public.messages
  add column if not exists cluster uuid references public.clusters (id) on delete cascade;

-- a message must be exactly one of the two shapes, and never addressed to its
-- own author as a direct message
alter table public.messages
  drop constraint if exists messages_target_check;
alter table public.messages
  add constraint messages_target_check check (
    (cluster is not null and recipient is null)
    or (recipient is not null and cluster is null and sender <> recipient)
  );

create index if not exists messages_cluster_idx on public.messages (cluster, created_at desc);
create index if not exists cluster_members_planet_idx on public.cluster_members (planet);

alter table public.clusters enable row level security;
alter table public.cluster_members enable row level security;

-- ---------------------------------------------------------------------------
-- membership helper
-- ---------------------------------------------------------------------------
-- RLS policies on `messages` need to ask "is the caller in this cluster". Doing
-- that with a subquery against `cluster_members` would re-enter that table's own
-- policy and, worse, risk infinite recursion. A security-definer function reads
-- the table directly, bypassing RLS, and is the documented way out of that trap.

create or replace function public.is_cluster_member(cluster_id uuid, who uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.cluster_members cm
    where cm.cluster = cluster_id and cm.planet = who
  );
$$;

revoke all on function public.is_cluster_member(uuid, uuid) from public, anon;
grant execute on function public.is_cluster_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- cluster RLS
-- ---------------------------------------------------------------------------

drop policy if exists "clusters are readable by members" on public.clusters;
create policy "clusters are readable by members" on public.clusters
  for select using (public.is_cluster_member(id, auth.uid()));

-- Only a member may create a cluster, and the creator must be themselves.
drop policy if exists "clusters are creatable by their creator" on public.clusters;
create policy "clusters are creatable by their creator" on public.clusters
  for insert with check (auth.uid() = creator);

-- The creator can rename a cluster.
drop policy if exists "clusters are renameable by creator" on public.clusters;
create policy "clusters are renameable by creator" on public.clusters
  for update using (auth.uid() = creator) with check (auth.uid() = creator);

drop policy if exists "clusters are deletable by creator" on public.clusters;
create policy "clusters are deletable by creator" on public.clusters
  for delete using (auth.uid() = creator);

drop policy if exists "membership is readable by members" on public.cluster_members;
create policy "membership is readable by members" on public.cluster_members
  for select using (public.is_cluster_member(cluster, auth.uid()));

-- The creator seats the initial members; anyone already inside may invite.
drop policy if exists "membership is writable by members" on public.cluster_members;
create policy "membership is writable by members" on public.cluster_members
  for insert with check (
    auth.uid() = planet
    or exists (select 1 from public.clusters c where c.id = cluster and c.creator = auth.uid())
    or public.is_cluster_member(cluster, auth.uid())
  );

-- A member may remove themselves; the creator may remove anyone.
drop policy if exists "membership is removable" on public.cluster_members;
create policy "membership is removable" on public.cluster_members
  for delete using (
    auth.uid() = planet
    or exists (select 1 from public.clusters c where c.id = cluster and c.creator = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- messages RLS — widened for clusters
-- ---------------------------------------------------------------------------

drop policy if exists "messages are readable by participants" on public.messages;
create policy "messages are readable by participants" on public.messages
  for select using (
    auth.uid() = sender
    or auth.uid() = recipient
    or (cluster is not null and public.is_cluster_member(cluster, auth.uid()))
  );

drop policy if exists "messages are insertable by sender" on public.messages;
create policy "messages are insertable by sender" on public.messages
  for insert with check (
    auth.uid() = sender
    and (
      (recipient is not null and sender <> recipient)
      or (cluster is not null and public.is_cluster_member(cluster, auth.uid()))
    )
  );

-- Read receipts: the direct recipient, or any cluster member other than the
-- author (a cluster has many readers, so "recipient" has no single meaning).
drop policy if exists "messages are markable read by recipient" on public.messages;
create policy "messages are markable read by recipient" on public.messages
  for update using (
    auth.uid() = recipient
    or (cluster is not null and auth.uid() <> sender and public.is_cluster_member(cluster, auth.uid()))
  )
  with check (
    auth.uid() = recipient
    or (cluster is not null and auth.uid() <> sender and public.is_cluster_member(cluster, auth.uid()))
  );

drop policy if exists "messages are deletable by sender" on public.messages;
create policy "messages are deletable by sender" on public.messages
  for delete using (auth.uid() = sender);

-- ---------------------------------------------------------------------------
-- create_cluster — one atomic call
-- ---------------------------------------------------------------------------
-- Inserting the cluster and its members from the client would be two round trips
-- that can half-fail, and the second insert is only allowed once membership
-- exists. A security-definer function does both in one transaction and returns
-- the new id.

create or replace function public.create_cluster(cluster_name text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  member uuid;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if cluster_name is null or length(btrim(cluster_name)) = 0 then
    raise exception 'a cluster needs a name';
  end if;

  insert into public.clusters (name, creator) values (btrim(cluster_name), me)
  returning id into new_id;

  insert into public.cluster_members (cluster, planet) values (new_id, me)
  on conflict do nothing;

  -- coalesce keeps a null array from skipping the loop entirely
  foreach member in array coalesce(member_ids, array[]::uuid[]) loop
    if member <> me then
      insert into public.cluster_members (cluster, planet) values (new_id, member)
      on conflict do nothing;
    end if;
  end loop;

  return new_id;
end;
$$;

revoke all on function public.create_cluster(text, uuid[]) from public, anon;
grant execute on function public.create_cluster(text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- planet_directory — find a person by @handle or name
-- ---------------------------------------------------------------------------
-- Signup already blocks the public anon key from enumerating accounts, and this
-- search would hand out exactly that. So it is granted to `authenticated` only
-- and returns the minimum a picker needs — no bio, no email, no timestamps.
-- Demo planets are included so a newcomer can practise on the seeded fleet, but
-- the client marks them so they cannot be messaged.

create or replace function public.planet_directory(term text, max_rows int default 20)
returns table (id uuid, handle text, name text, seed bigint, is_demo boolean)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.handle, p.name, p.seed, p.is_demo
  from public.planets p
  where length(btrim(coalesce(term, ''))) > 0
    and (
      p.handle ilike '%' || btrim(term) || '%'
      or p.name ilike '%' || btrim(term) || '%'
    )
  order by
    -- exact handle first, then prefix matches, then everything else
    (lower(p.handle) = lower(btrim(term))) desc,
    (p.handle ilike btrim(term) || '%') desc,
    p.handle
  limit least(coalesce(max_rows, 20), 50);
$$;

revoke all on function public.planet_directory(text, int) from public, anon;
grant execute on function public.planet_directory(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- realtime
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.clusters;
exception
  when undefined_object then null;
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.cluster_members;
exception
  when undefined_object then null;
  when duplicate_object then null;
end;
$$;
