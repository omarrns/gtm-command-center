begin;

create table if not exists public.icp_agent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  stage text not null,
  status text not null check (status in ('started', 'succeeded', 'failed', 'skipped')),
  message text,
  session_id uuid references public.icp_chat_sessions(id) on delete set null,
  insight_id uuid references public.icp_session_insights(id) on delete set null,
  evidence_ids uuid[] not null default '{}'::uuid[],
  candidate_id uuid references public.icp_revision_candidates(id) on delete set null,
  commit_id uuid references public.icp_revision_commits(id) on delete set null,
  model text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists icp_agent_events_user_created_idx
  on public.icp_agent_events (user_id, created_at desc);
create index if not exists icp_agent_events_job_idx
  on public.icp_agent_events (job_id, created_at);
create index if not exists icp_agent_events_session_idx
  on public.icp_agent_events (session_id, created_at);
create index if not exists icp_agent_events_insight_idx
  on public.icp_agent_events (insight_id, created_at);
create index if not exists icp_agent_events_candidate_idx
  on public.icp_agent_events (candidate_id, created_at);
create index if not exists icp_agent_events_commit_idx
  on public.icp_agent_events (commit_id, created_at);
create index if not exists icp_agent_events_evidence_ids_idx
  on public.icp_agent_events using gin (evidence_ids);

alter table public.icp_agent_events enable row level security;

drop policy if exists "Users select own icp agent events" on public.icp_agent_events;
create policy "Users select own icp agent events"
  on public.icp_agent_events for select using (auth.uid() = user_id);

commit;
