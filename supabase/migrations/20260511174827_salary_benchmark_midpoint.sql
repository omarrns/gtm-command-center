begin;

alter table public.salary_benchmark_observations
  add column if not exists salary_midpoint numeric;

comment on column public.salary_benchmark_observations.salary_midpoint is
  'Blended annual salary midpoint. Averages the source salary range midpoint and LLM salary estimate midpoint when both are available.';

with midpoint_inputs as (
  select
    id,
    case
      when salary_min is not null and salary_max is not null then (salary_min + salary_max) / 2
      when salary_min is not null then salary_min
      when salary_max is not null then salary_max
      else null
    end as source_midpoint,
    case
      when llm_salary_estimate is null then null
      when jsonb_typeof(llm_salary_estimate) <> 'object' then null
      when jsonb_typeof(llm_salary_estimate -> 'min_salary') = 'number'
        and jsonb_typeof(llm_salary_estimate -> 'max_salary') = 'number'
        then (
          ((llm_salary_estimate ->> 'min_salary')::numeric)
          + ((llm_salary_estimate ->> 'max_salary')::numeric)
        ) / 2
      when jsonb_typeof(llm_salary_estimate -> 'min_salary') = 'number'
        then (llm_salary_estimate ->> 'min_salary')::numeric
      when jsonb_typeof(llm_salary_estimate -> 'max_salary') = 'number'
        then (llm_salary_estimate ->> 'max_salary')::numeric
      else null
    end as llm_midpoint
  from public.salary_benchmark_observations
)
update public.salary_benchmark_observations as observations
set salary_midpoint = case
  when midpoint_inputs.source_midpoint is not null
    and midpoint_inputs.llm_midpoint is not null
    then (midpoint_inputs.source_midpoint + midpoint_inputs.llm_midpoint) / 2
  when midpoint_inputs.source_midpoint is not null then midpoint_inputs.source_midpoint
  else midpoint_inputs.llm_midpoint
end
from midpoint_inputs
where observations.id = midpoint_inputs.id;

commit;
