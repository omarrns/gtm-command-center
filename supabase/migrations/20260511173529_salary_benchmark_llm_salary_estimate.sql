begin;

alter table public.salary_benchmark_observations
  add column if not exists llm_salary_estimate jsonb;

comment on column public.salary_benchmark_observations.llm_salary_estimate is
  'LLM-interpreted salary estimate with provenance, confidence, and evidence. Source salary_min/salary_max remain JSearch metadata.';

commit;
