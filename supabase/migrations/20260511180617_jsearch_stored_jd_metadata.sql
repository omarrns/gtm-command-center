begin;

alter table public.opportunities
  add column if not exists job_highlights jsonb,
  add column if not exists job_source_payload jsonb;

comment on column public.opportunities.job_highlights is
  'Structured highlights from the source job API, such as JSearch Qualifications and Responsibilities sections. No external scraping.';

comment on column public.opportunities.job_source_payload is
  'Validated source job payload captured at import time for no-loss source metadata retention. No external scraping.';

commit;
