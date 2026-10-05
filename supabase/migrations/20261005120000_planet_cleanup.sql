-- A planet's id mirrors its auth user's id, but there is deliberately no foreign
-- key: demo planets are seeded with random uuids that have no auth user, so a
-- FK would reject them. Instead this trigger keeps the two in step on deletion.
-- Without it, removing a user (dashboard, admin API, or a cascaded delete) left
-- an orphan planet behind — and the app's own delete_me() only covers the
-- in-app path.

create or replace function public.cleanup_planet_on_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from public.planets where id = old.id;

  update public.planets
     set following = array_remove(following, old.id),
         saved = array_remove(saved, old.id)
   where following @> array[old.id] or saved @> array[old.id];

  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.cleanup_planet_on_user_delete();
