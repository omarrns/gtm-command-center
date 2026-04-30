begin;

create table if not exists public.video_icp_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  youtube_url text not null,
  video_id text,
  video_title text,
  channel_title text,
  duration_sec integer,
  status text not null default 'pending'
    check (status in ('pending','running','complete','failed')),
  error text,
  transcript jsonb,
  comments jsonb,
  comments_status text not null default 'not_requested'
    check (comments_status in ('not_requested','fetched','failed')),
  comments_error text,
  analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_icp_reviews_user_created_idx
  on public.video_icp_reviews (user_id, created_at desc);
create index if not exists video_icp_reviews_job_idx
  on public.video_icp_reviews (job_id);
create index if not exists video_icp_reviews_status_idx
  on public.video_icp_reviews (status);

alter table public.video_icp_reviews enable row level security;

drop policy if exists "video_icp_reviews_select_own"
  on public.video_icp_reviews;
create policy "video_icp_reviews_select_own"
  on public.video_icp_reviews
  for select using (auth.uid() = user_id);

drop policy if exists "video_icp_reviews_insert_own"
  on public.video_icp_reviews;
create policy "video_icp_reviews_insert_own"
  on public.video_icp_reviews
  for insert with check (auth.uid() = user_id);

drop trigger if exists trg_video_icp_reviews_updated_at
  on public.video_icp_reviews;
create trigger trg_video_icp_reviews_updated_at
  before update on public.video_icp_reviews
  for each row execute function public.set_updated_at();

comment on table public.video_icp_reviews is
  'GTM-only YouTube transcript reviews against a confirmed ICP rubric.';

commit;
