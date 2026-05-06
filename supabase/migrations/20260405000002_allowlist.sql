-- Restrict sign-ups to allowlisted emails only.
-- New users not on the list get is_enabled = false and are blocked by requireUser().

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name, is_enabled)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    lower(new.email) = 'operator@example.com'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
