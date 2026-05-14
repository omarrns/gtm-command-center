begin;

create table if not exists public.salary_benchmark_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  company_name text not null,
  role_title text not null,
  role_family text not null check (
    role_family in (
      'gtm_engineering',
      'revops',
      'growth_engineering',
      'sales_ops',
      'business_ops',
      'not_relevant'
    )
  ),
  seniority text not null check (
    seniority in (
      'entry',
      'mid',
      'senior',
      'staff',
      'manager',
      'director',
      'executive',
      'unknown'
    )
  ),
  company_stage text not null check (
    company_stage in (
      'pre_seed_seed',
      'series_a_b',
      'series_c_plus',
      'public',
      'enterprise',
      'unknown'
    )
  ),
  salary_min numeric,
  salary_max numeric,
  salary_period text,
  salary_currency text,
  currency_source text not null check (
    currency_source in ('api', 'inferred_us_location', 'unknown')
  ),
  location text,
  is_remote boolean,
  benchmark_usable boolean not null default false,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  model text not null,
  model_rationale text not null,
  raw_classification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id)
);

create index if not exists salary_benchmark_user_family_idx
  on public.salary_benchmark_observations (user_id, role_family, benchmark_usable);
create index if not exists salary_benchmark_user_company_stage_idx
  on public.salary_benchmark_observations (user_id, company_stage);
create index if not exists salary_benchmark_opportunity_idx
  on public.salary_benchmark_observations (opportunity_id);

alter table public.salary_benchmark_observations enable row level security;

drop policy if exists "Users select own salary benchmark observations"
  on public.salary_benchmark_observations;
create policy "Users select own salary benchmark observations"
  on public.salary_benchmark_observations
  for select using (auth.uid() = user_id);

drop trigger if exists trg_salary_benchmark_observations_updated_at
  on public.salary_benchmark_observations;
create trigger trg_salary_benchmark_observations_updated_at
  before update on public.salary_benchmark_observations
  for each row execute function public.set_updated_at();

commit;
