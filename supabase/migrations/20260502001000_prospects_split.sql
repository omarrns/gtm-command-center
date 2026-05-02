begin;

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('yt_comments')),
  external_id text not null,
  video_icp_review_id uuid references public.video_icp_reviews(id) on delete set null,
  display_name text not null,
  youtube_author_id text,
  youtube_comment_id text,
  youtube_channel_url text,
  company_name text,
  company_domain text,
  company_confidence text not null default 'none'
    check (company_confidence in ('none','low','medium','high')),
  comment_text text not null,
  comment_like_count integer,
  comment_timestamp_sec integer,
  evidence jsonb not null default '{}',
  status text not null default 'discovered'
    check (status in ('discovered','scored','filtered','promoted','dismissed')),
  score integer check (score >= 0 and score <= 100),
  score_components jsonb,
  analysis_id uuid references public.analyses(id) on delete set null,
  last_error text,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create index if not exists prospects_user_status_score_idx
  on public.prospects (user_id, status, score desc);
create index if not exists prospects_user_review_idx
  on public.prospects (user_id, video_icp_review_id);
create index if not exists prospects_user_company_domain_idx
  on public.prospects (user_id, company_domain);

alter table public.prospects enable row level security;

drop policy if exists "prospects_select_own" on public.prospects;
create policy "prospects_select_own"
  on public.prospects
  for select using (auth.uid() = user_id);

drop policy if exists "prospects_insert_own" on public.prospects;
create policy "prospects_insert_own"
  on public.prospects
  for insert with check (auth.uid() = user_id);

drop trigger if exists trg_prospects_updated_at on public.prospects;
create trigger trg_prospects_updated_at
  before update on public.prospects
  for each row execute function public.set_updated_at();

create or replace function check_prospect_ownership() returns trigger as $$
begin
  if new.analysis_id is not null and (tg_op = 'INSERT' or new.analysis_id is distinct from old.analysis_id) then
    if not exists (select 1 from analyses where id = new.analysis_id and user_id = new.user_id) then
      raise exception 'analysis_id does not belong to this user';
    end if;
  end if;

  if new.video_icp_review_id is not null and (tg_op = 'INSERT' or new.video_icp_review_id is distinct from old.video_icp_review_id) then
    if not exists (select 1 from video_icp_reviews where id = new.video_icp_review_id and user_id = new.user_id) then
      raise exception 'video_icp_review_id does not belong to this user';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists check_prospect_ownership_trigger on public.prospects;
create trigger check_prospect_ownership_trigger
  before insert or update on public.prospects
  for each row execute function public.check_prospect_ownership();

alter table public.opportunities
  add column if not exists prospect_id uuid references public.prospects(id) on delete set null;

create index if not exists opportunities_prospect_id_idx
  on public.opportunities (prospect_id);

alter table public.opportunities
  drop constraint if exists opportunities_source_check;

alter table public.opportunities
  add constraint opportunities_source_check
  check (source in ('jsearch', 'exa', 'manual', 'theirstack', 'exa-dormant', 'yt_comments'));

alter table public.opportunities
  drop constraint if exists opportunities_yt_comments_promoted_account_check;

alter table public.opportunities
  add constraint opportunities_yt_comments_promoted_account_check
  check (
    source <> 'yt_comments'
    or (prospect_id is not null and company_domain is not null)
  );

create or replace function check_opportunity_ownership() returns trigger as $$
begin
  if new.analysis_id is not null and (tg_op = 'INSERT' or new.analysis_id is distinct from old.analysis_id) then
    if not exists (select 1 from analyses where id = new.analysis_id and user_id = new.user_id) then
      raise exception 'analysis_id does not belong to this user';
    end if;
  end if;

  if new.research_id is not null and (tg_op = 'INSERT' or new.research_id is distinct from old.research_id) then
    if not exists (select 1 from research_reports where id = new.research_id and user_id = new.user_id) then
      raise exception 'research_id does not belong to this user';
    end if;
  end if;

  if new.selected_draft_id is not null and (tg_op = 'INSERT' or new.selected_draft_id is distinct from old.selected_draft_id) then
    if not exists (
      select 1 from email_drafts
      where id = new.selected_draft_id
        and user_id = new.user_id
        and opportunity_id = new.id
    ) then
      raise exception 'selected_draft_id does not belong to this user/opportunity';
    end if;
  end if;

  if new.prospect_id is not null and (tg_op = 'INSERT' or new.prospect_id is distinct from old.prospect_id) then
    if not exists (select 1 from prospects where id = new.prospect_id and user_id = new.user_id) then
      raise exception 'prospect_id does not belong to this user';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

comment on table public.prospects is
  'Person-level GTM prospects discovered from YouTube comments and scored before optional account promotion.';
comment on column public.opportunities.prospect_id is
  'Optional source prospect when a person-level prospect is promoted into an account-shaped opportunity.';

commit;
