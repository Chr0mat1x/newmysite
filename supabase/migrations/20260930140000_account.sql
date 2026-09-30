-- ---------------------------------------------------------------------------
-- account self-service
-- ---------------------------------------------------------------------------
-- Email and password changes go through Supabase Auth directly (the client
-- calls updateUser), so nothing here. What the browser cannot do is remove the
-- auth user: `auth.users` is not reachable through the anon key. This RPC is the
-- one privileged operation ORBIT needs, and it is deliberately narrow — it acts
-- only on the caller's own id and can never be pointed at somebody else.

create or replace function public.delete_me()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;

  -- Drop the planet first: satellites, signals and stars cascade from it. Then
  -- scrub the id out of every other planet's follow/save arrays, so nobody is
  -- left following a world that no longer exists.
  delete from public.planets where id = me;

  update public.planets
     set following = array_remove(following, me),
         saved = array_remove(saved, me)
   where following @> array[me] or saved @> array[me];

  delete from auth.users where id = me;
end;
$$;

-- Only a signed-in owner can delete; anon has no account to remove.
revoke all on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;
