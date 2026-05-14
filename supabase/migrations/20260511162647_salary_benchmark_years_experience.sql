begin;

alter table public.salary_benchmark_observations
  add column if not exists min_years_experience numeric,
  add column if not exists max_years_experience numeric,
  add column if not exists years_experience_evidence text;

alter table public.salary_benchmark_observations
  drop constraint if exists salary_benchmark_years_experience_range_check;

alter table public.salary_benchmark_observations
  add constraint salary_benchmark_years_experience_range_check
  check (
    (min_years_experience is null or min_years_experience >= 0)
    and (max_years_experience is null or max_years_experience >= 0)
    and (
      min_years_experience is null
      or max_years_experience is null
      or min_years_experience <= max_years_experience
    )
  );

commit;
