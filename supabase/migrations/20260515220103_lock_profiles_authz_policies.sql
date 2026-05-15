-- Lock authorization-bearing profile fields to trusted server/service-role code.
-- Browser clients may read their own profile, but cannot self-enable or switch persona.

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
