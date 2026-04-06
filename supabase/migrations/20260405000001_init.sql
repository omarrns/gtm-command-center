-- GTM Command Center — Initial schema
-- All user-scoped tables enable RLS. Every feature table carries user_id from day one
-- so the app is multi-tenant even though early access is invite-only.

set check_function_bodies = off;

-- Helper: updated_at touch trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

------------------------------------------------------------
-- profiles
------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = user_id);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row on new auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------
-- jobs (background job queue)
------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  status text not null default 'pending'
    check (status in ('pending','running','complete','failed')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_user_id_idx on public.jobs (user_id);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_pending_created_idx on public.jobs (created_at)
  where status = 'pending';

alter table public.jobs enable row level security;

drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own" on public.jobs
  for select using (auth.uid() = user_id);

drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own" on public.jobs
  for insert with check (auth.uid() = user_id);

-- Workers use service-role (bypasses RLS) to update status. Users cannot update jobs directly.
drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- analyses (Phase 1: JD rubric, company fit, full analysis)
------------------------------------------------------------
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_slug text not null,
  company_name text,
  role_title text,
  job_description text,
  status text not null default 'draft'
    check (status in ('draft','running','complete','failed')),
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analyses_user_id_idx on public.analyses (user_id);
create index if not exists analyses_user_created_idx on public.analyses (user_id, created_at desc);

alter table public.analyses enable row level security;

drop policy if exists "analyses_select_own" on public.analyses;
create policy "analyses_select_own" on public.analyses
  for select using (auth.uid() = user_id);

drop policy if exists "analyses_insert_own" on public.analyses;
create policy "analyses_insert_own" on public.analyses
  for insert with check (auth.uid() = user_id);

drop policy if exists "analyses_update_own" on public.analyses;
create policy "analyses_update_own" on public.analyses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "analyses_delete_own" on public.analyses;
create policy "analyses_delete_own" on public.analyses
  for delete using (auth.uid() = user_id);

drop trigger if exists trg_analyses_updated_at on public.analyses;
create trigger trg_analyses_updated_at
  before update on public.analyses
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- email_drafts (Phase 2)
------------------------------------------------------------
create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_type text not null,
  company_name text,
  recipient_name text,
  recipient_title text,
  context jsonb not null default '{}'::jsonb,
  subject text,
  body text,
  variant_index integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft','saved','archived')),
  source_analysis_id uuid references public.analyses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_drafts_user_idx on public.email_drafts (user_id);
create index if not exists email_drafts_user_created_idx on public.email_drafts (user_id, created_at desc);

alter table public.email_drafts enable row level security;

drop policy if exists "email_drafts_select_own" on public.email_drafts;
create policy "email_drafts_select_own" on public.email_drafts
  for select using (auth.uid() = user_id);

drop policy if exists "email_drafts_insert_own" on public.email_drafts;
create policy "email_drafts_insert_own" on public.email_drafts
  for insert with check (auth.uid() = user_id);

drop policy if exists "email_drafts_update_own" on public.email_drafts;
create policy "email_drafts_update_own" on public.email_drafts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "email_drafts_delete_own" on public.email_drafts;
create policy "email_drafts_delete_own" on public.email_drafts
  for delete using (auth.uid() = user_id);

drop trigger if exists trg_email_drafts_updated_at on public.email_drafts;
create trigger trg_email_drafts_updated_at
  before update on public.email_drafts
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- research_reports (Phase 3)
------------------------------------------------------------
create table if not exists public.research_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  role_title text,
  research_type text not null,
  status text not null default 'pending'
    check (status in ('pending','running','complete','failed')),
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_reports_user_idx on public.research_reports (user_id);
create index if not exists research_reports_user_created_idx on public.research_reports (user_id, created_at desc);

alter table public.research_reports enable row level security;

drop policy if exists "research_reports_select_own" on public.research_reports;
create policy "research_reports_select_own" on public.research_reports
  for select using (auth.uid() = user_id);

drop policy if exists "research_reports_insert_own" on public.research_reports;
create policy "research_reports_insert_own" on public.research_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "research_reports_update_own" on public.research_reports;
create policy "research_reports_update_own" on public.research_reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "research_reports_delete_own" on public.research_reports;
create policy "research_reports_delete_own" on public.research_reports
  for delete using (auth.uid() = user_id);

drop trigger if exists trg_research_reports_updated_at on public.research_reports;
create trigger trg_research_reports_updated_at
  before update on public.research_reports
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- memory_documents (Phase 4)
------------------------------------------------------------
create table if not exists public.memory_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_key text not null,
  source_path text,
  title text not null,
  origin text not null default 'imported',
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, document_key)
);

create index if not exists memory_documents_user_idx on public.memory_documents (user_id);

alter table public.memory_documents enable row level security;

drop policy if exists "memory_documents_select_own" on public.memory_documents;
create policy "memory_documents_select_own" on public.memory_documents
  for select using (auth.uid() = user_id);

drop policy if exists "memory_documents_insert_own" on public.memory_documents;
create policy "memory_documents_insert_own" on public.memory_documents
  for insert with check (auth.uid() = user_id);

drop policy if exists "memory_documents_update_own" on public.memory_documents;
create policy "memory_documents_update_own" on public.memory_documents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "memory_documents_delete_own" on public.memory_documents;
create policy "memory_documents_delete_own" on public.memory_documents
  for delete using (auth.uid() = user_id);

drop trigger if exists trg_memory_documents_updated_at on public.memory_documents;
create trigger trg_memory_documents_updated_at
  before update on public.memory_documents
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- coaching_sessions (Phase 4)
------------------------------------------------------------
create table if not exists public.coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','running','complete','failed')),
  transcript jsonb,
  summary jsonb,
  trail_entry text,
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coaching_sessions_user_idx on public.coaching_sessions (user_id);
create index if not exists coaching_sessions_user_created_idx on public.coaching_sessions (user_id, created_at desc);

alter table public.coaching_sessions enable row level security;

drop policy if exists "coaching_sessions_select_own" on public.coaching_sessions;
create policy "coaching_sessions_select_own" on public.coaching_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "coaching_sessions_insert_own" on public.coaching_sessions;
create policy "coaching_sessions_insert_own" on public.coaching_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists "coaching_sessions_update_own" on public.coaching_sessions;
create policy "coaching_sessions_update_own" on public.coaching_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_coaching_sessions_updated_at on public.coaching_sessions;
create trigger trg_coaching_sessions_updated_at
  before update on public.coaching_sessions
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- workspace_artifacts (Phase 4: prompts, skills, chat exports, iMessage exports)
------------------------------------------------------------
create table if not exists public.workspace_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_type text not null,
  title text not null,
  content text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','running','complete','failed')),
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_artifacts_user_idx on public.workspace_artifacts (user_id);
create index if not exists workspace_artifacts_user_created_idx on public.workspace_artifacts (user_id, created_at desc);

alter table public.workspace_artifacts enable row level security;

drop policy if exists "workspace_artifacts_select_own" on public.workspace_artifacts;
create policy "workspace_artifacts_select_own" on public.workspace_artifacts
  for select using (auth.uid() = user_id);

drop policy if exists "workspace_artifacts_insert_own" on public.workspace_artifacts;
create policy "workspace_artifacts_insert_own" on public.workspace_artifacts
  for insert with check (auth.uid() = user_id);

drop policy if exists "workspace_artifacts_update_own" on public.workspace_artifacts;
create policy "workspace_artifacts_update_own" on public.workspace_artifacts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "workspace_artifacts_delete_own" on public.workspace_artifacts;
create policy "workspace_artifacts_delete_own" on public.workspace_artifacts
  for delete using (auth.uid() = user_id);

drop trigger if exists trg_workspace_artifacts_updated_at on public.workspace_artifacts;
create trigger trg_workspace_artifacts_updated_at
  before update on public.workspace_artifacts
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- Atomic job claim: pending -> running (single worker wins)
------------------------------------------------------------
create or replace function public.claim_next_job(worker_types text[])
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.jobs;
begin
  update public.jobs
     set status = 'running', updated_at = now()
   where id = (
     select id from public.jobs
      where status = 'pending'
        and type = any(worker_types)
      order by created_at asc
      for update skip locked
      limit 1
   )
   returning * into claimed;
  return claimed;
end;
$$;

grant execute on function public.claim_next_job(text[]) to service_role;
