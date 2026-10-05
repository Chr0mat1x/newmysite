-- ---------------------------------------------------------------------------
-- push subscriptions
-- ---------------------------------------------------------------------------
-- One row per browser/device that agreed to receive Web Push for a planet.
-- A planet can have many (phone, laptop, tablet); each is addressed by its
-- unique endpoint. The keys are the browser's public encryption material, not
-- secrets of ours — but they are still only readable by their owner, because a
-- leaked p256dh/auth pair lets anyone send that device a notification.
--
-- The sender never reads this table: the `send-push` edge function does, with
-- the service role, so RLS here only has to protect the owner's own rows.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  planet uuid not null references public.planets (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_planet_idx on public.push_subscriptions (planet);

alter table public.push_subscriptions enable row level security;

-- You manage only your own subscriptions. There is no cross-planet read.
drop policy if exists "push subscriptions are owned" on public.push_subscriptions;
create policy "push subscriptions are owned" on public.push_subscriptions
  for all using (auth.uid() = planet) with check (auth.uid() = planet);

-- ---------------------------------------------------------------------------
-- notify on new message
-- ---------------------------------------------------------------------------
-- Realtime alone cannot wake a closed app, so the client asks the `send-push`
-- function right after it inserts a message. The function re-reads the row with
-- the service role and checks the caller is really its sender before sending,
-- so a client cannot push on someone else's behalf.
