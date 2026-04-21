ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS job_city            text,
  ADD COLUMN IF NOT EXISTS job_state           text,
  ADD COLUMN IF NOT EXISTS job_is_remote       boolean,
  ADD COLUMN IF NOT EXISTS job_employment_type text,
  ADD COLUMN IF NOT EXISTS job_min_salary      numeric,
  ADD COLUMN IF NOT EXISTS job_max_salary      numeric,
  ADD COLUMN IF NOT EXISTS job_salary_currency text,
  ADD COLUMN IF NOT EXISTS job_salary_period   text,
  ADD COLUMN IF NOT EXISTS job_required_skills text[];
