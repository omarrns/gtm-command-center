alter table public.gmail_credentials
  add column if not exists granted_scopes text[];
