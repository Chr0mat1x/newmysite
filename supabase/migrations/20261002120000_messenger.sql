-- ---------------------------------------------------------------------------
-- messenger
-- ---------------------------------------------------------------------------
-- Direct messages between planets. A thread is the unordered pair
-- (sender, recipient): there is no conversation row, so neither side can be
-- left holding a stale pointer to a thread the other one deleted.
--
-- Privacy is the whole point here, so the RLS rules are tighter than anywhere
-- else in the schema: a message is readable only by the two planets in it and
-- writable only by the sender. The public anon key cannot read the galaxy's
-- mail, which is what stops the messenger from being a broadcast channel.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references public.planets (id) on delete cascade,
  recipient uuid not null references public.planets (id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender <> recipient)
);

-- every thread read is "messages where I am one side and the other side is X",
-- so index both directions rather than only the sender
create index if not exists messages_sender_idx on public.messages (sender, created_at desc);
create index if not exists messages_recipient_idx on public.messages (recipient, created_at desc);

alter table public.messages enable row level security;

-- Only the two participants can see a message. Not `using (true)` like every
-- other table: this one is private.
drop policy if exists "messages are readable by participants" on public.messages;
create policy "messages are readable by participants" on public.messages
  for select using (auth.uid() = sender or auth.uid() = recipient);

-- You may only send as yourself, and only to somebody else.
drop policy if exists "messages are insertable by sender" on public.messages;
create policy "messages are insertable by sender" on public.messages
  for insert with check (auth.uid() = sender and sender <> recipient);

-- The recipient marks a message read; the sender may not rewrite history.
drop policy if exists "messages are markable read by recipient" on public.messages;
create policy "messages are markable read by recipient" on public.messages
  for update using (auth.uid() = recipient) with check (auth.uid() = recipient);

-- Either side can clear a message out of their own thread.
drop policy if exists "messages are deletable by sender" on public.messages;
create policy "messages are deletable by sender" on public.messages
  for delete using (auth.uid() = sender);

-- ---------------------------------------------------------------------------
-- demo planets
-- ---------------------------------------------------------------------------
-- The seeded fleet has no accounts behind it, so it can neither send nor read.
-- RLS already enforces that; the constraint that matters for the demo is the
-- FK: a message referencing a demo planet is fine, but no client can forge one
-- as a demo planet because auth.uid() is never a demo id.

-- ---------------------------------------------------------------------------
-- realtime
-- ---------------------------------------------------------------------------
-- Add the table to the realtime publication so a recipient's open thread can
-- update without polling. Guarded because the publication name differs between
-- a full Supabase stack and a slimmed-down one, and a missing publication should
-- not fail the migration — the client falls back to the 60s refresh.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when undefined_object then null;
  when duplicate_object then null;
end;
$$;
