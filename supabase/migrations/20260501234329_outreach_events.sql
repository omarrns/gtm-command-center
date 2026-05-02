create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  email_draft_id uuid references public.email_drafts(id) on delete set null,
  event_type text not null check (
    event_type in (
      'sent',
      'reply_detected',
      'manual_outcome',
      'no_response_7d'
    )
  ),
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists outreach_events_user_time_idx
  on public.outreach_events (user_id, occurred_at desc);

create index if not exists outreach_events_opportunity_time_idx
  on public.outreach_events (opportunity_id, occurred_at desc);

create index if not exists outreach_events_event_type_idx
  on public.outreach_events (event_type);

create or replace function public.check_outreach_event_ownership()
returns trigger as $$
begin
  if not exists (
    select 1 from public.opportunities
    where id = new.opportunity_id
      and user_id = new.user_id
  ) then
    raise exception 'opportunity_id does not belong to this user';
  end if;

  if new.email_draft_id is not null and not exists (
    select 1 from public.email_drafts
    where id = new.email_draft_id
      and user_id = new.user_id
      and opportunity_id = new.opportunity_id
  ) then
    raise exception 'email_draft_id does not belong to this user/opportunity';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists check_outreach_event_ownership_trigger
  on public.outreach_events;
create trigger check_outreach_event_ownership_trigger
  before insert or update on public.outreach_events
  for each row execute function public.check_outreach_event_ownership();

alter table public.outreach_events enable row level security;

drop policy if exists "Users select own outreach events" on public.outreach_events;
create policy "Users select own outreach events" on public.outreach_events
  for select using (auth.uid() = user_id);
