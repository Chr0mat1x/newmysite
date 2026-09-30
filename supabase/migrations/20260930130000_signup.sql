-- ---------------------------------------------------------------------------
-- signup
-- ---------------------------------------------------------------------------
-- The signup form checks whether a @handle is free before submitting, so it can
-- say "that one is taken" instead of quietly letting the trigger suffix it to
-- `nova2`. `planets` is world-readable under RLS, so the browser could do this
-- with a plain select; the RPC keeps the rule in one place next to
-- unique_handle() and matches its normalisation exactly.

create or replace function public.handle_available(desired text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    regexp_replace(lower(coalesce(desired, '')), '[^a-z0-9_]', '', 'g') <> ''
    and not exists (
      select 1
      from public.planets p
      where p.handle = left(
        regexp_replace(lower(coalesce(desired, '')), '[^a-z0-9_]', '', 'g'),
        20
      )
    );
$$;

grant execute on function public.handle_available(text) to anon, authenticated;
