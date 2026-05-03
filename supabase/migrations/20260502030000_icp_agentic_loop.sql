begin;

create table if not exists public.icp_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  account_name text,
  account_domain text,
  purpose text not null default 'account_prep',
  status text not null default 'active'
    check (status in ('active', 'completed', 'distilling', 'complete', 'failed')),
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.icp_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.icp_chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ordinal integer not null,
  role text not null check (role in ('system', 'user', 'assistant')),
  content text not null default '',
  message jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, ordinal)
);

create table if not exists public.icp_session_insights (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.icp_chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null,
  insights jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.icp_evidence_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.icp_chat_sessions(id) on delete cascade,
  insight_id uuid references public.icp_session_insights(id) on delete set null,
  evidence_type text not null
    check (evidence_type in ('account_memory', 'messaging_lesson', 'icp_calibration', 'ignored')),
  title text not null,
  detail text not null,
  target text not null default 'none',
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  metadata jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.icp_revision_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'rejected' check (status in ('rejected', 'applied')),
  target text not null check (target in ('rubric', 'narrative')),
  title text not null,
  reason text not null,
  proposed_patch jsonb not null,
  judge_result jsonb not null default '{}'::jsonb,
  before_snapshot jsonb not null,
  after_snapshot jsonb,
  evidence_ids uuid[] not null default '{}'::uuid[],
  proposer_model text not null,
  judge_model text not null,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create table if not exists public.icp_revision_commits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid references public.icp_revision_candidates(id) on delete set null,
  rollback_of uuid references public.icp_revision_commits(id) on delete set null,
  target text not null check (target in ('rubric', 'narrative', 'rollback')),
  title text not null,
  reason text not null,
  changed_paths text[] not null default '{}'::text[],
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  diff jsonb not null,
  evidence_ids uuid[] not null default '{}'::uuid[],
  proposer_model text,
  judge_model text,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create index if not exists icp_chat_sessions_user_created_idx
  on public.icp_chat_sessions (user_id, created_at desc);
create index if not exists icp_chat_messages_session_idx
  on public.icp_chat_messages (session_id, ordinal);
create index if not exists icp_session_insights_session_idx
  on public.icp_session_insights (session_id, created_at desc);
create index if not exists icp_evidence_user_created_idx
  on public.icp_evidence_items (user_id, created_at desc);
create index if not exists icp_evidence_unprocessed_idx
  on public.icp_evidence_items (user_id, evidence_type, created_at)
  where processed_at is null;
create index if not exists icp_revision_candidates_user_created_idx
  on public.icp_revision_candidates (user_id, created_at desc);
create index if not exists icp_revision_commits_user_created_idx
  on public.icp_revision_commits (user_id, created_at desc);

alter table public.icp_chat_sessions enable row level security;
alter table public.icp_chat_messages enable row level security;
alter table public.icp_session_insights enable row level security;
alter table public.icp_evidence_items enable row level security;
alter table public.icp_revision_candidates enable row level security;
alter table public.icp_revision_commits enable row level security;

drop policy if exists "Users select own icp chat sessions" on public.icp_chat_sessions;
create policy "Users select own icp chat sessions"
  on public.icp_chat_sessions for select using (auth.uid() = user_id);
drop policy if exists "Users insert own icp chat sessions" on public.icp_chat_sessions;
create policy "Users insert own icp chat sessions"
  on public.icp_chat_sessions for insert with check (auth.uid() = user_id);

drop policy if exists "Users select own icp chat messages" on public.icp_chat_messages;
create policy "Users select own icp chat messages"
  on public.icp_chat_messages for select using (auth.uid() = user_id);

drop policy if exists "Users select own icp insights" on public.icp_session_insights;
create policy "Users select own icp insights"
  on public.icp_session_insights for select using (auth.uid() = user_id);

drop policy if exists "Users select own icp evidence" on public.icp_evidence_items;
create policy "Users select own icp evidence"
  on public.icp_evidence_items for select using (auth.uid() = user_id);

drop policy if exists "Users select own icp revision candidates" on public.icp_revision_candidates;
create policy "Users select own icp revision candidates"
  on public.icp_revision_candidates for select using (auth.uid() = user_id);

drop policy if exists "Users select own icp revision commits" on public.icp_revision_commits;
create policy "Users select own icp revision commits"
  on public.icp_revision_commits for select using (auth.uid() = user_id);

drop trigger if exists trg_icp_chat_sessions_updated_at on public.icp_chat_sessions;
create trigger trg_icp_chat_sessions_updated_at
  before update on public.icp_chat_sessions
  for each row execute function public.set_updated_at();

commit;
