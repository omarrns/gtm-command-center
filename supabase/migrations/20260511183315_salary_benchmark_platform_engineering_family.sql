begin;

alter table public.salary_benchmark_observations
  drop constraint if exists salary_benchmark_observations_role_family_check;

alter table public.salary_benchmark_observations
  add constraint salary_benchmark_observations_role_family_check
  check (
    role_family in (
      'gtm_engineering',
      'revops',
      'growth_engineering',
      'sales_ops',
      'business_ops',
      'platform_engineering',
      'not_relevant'
    )
  );

commit;
