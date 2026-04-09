-- Phase 11: Store the actual job posting date from JSearch so activation
-- can display "Posted X ago" accurately instead of using discovered_at.
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS job_posted_at timestamptz;
