-- Keep signup allowlisting in sync with the operator account and the
-- resettable demo account.

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
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'name', new.email),
    lower(new.email) in (
      'operator@example.com',
      'demo@example.com'
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

update public.profiles
set is_enabled = true
where lower(email) = 'demo@example.com';
