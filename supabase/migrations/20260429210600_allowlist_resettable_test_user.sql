-- Keep signup allowlisting in sync with protected production users and the
-- resettable script/test account.

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
      'omarns059@gmail.com',
      'bloomtea@proton.me',
      'omarns059+1@gmail.com'
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

update public.profiles
set is_enabled = true
where lower(email) = 'omarns059+1@gmail.com';
