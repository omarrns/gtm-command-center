-- Phase 1 template abstraction: stamp each onboarding_interviews row with the
-- template it belongs to. Existing rows get 'job_search' v1 via DEFAULT.
-- Replace the global single-active-interview index with a per-template one so
-- future templates (icp_definition, positioning_rubric) can have their own
-- active interview concurrently with job_search.

BEGIN;

ALTER TABLE public.onboarding_interviews
  ADD COLUMN template_id text NOT NULL DEFAULT 'job_search',
  ADD COLUMN template_version text NOT NULL DEFAULT 'v1';

CREATE UNIQUE INDEX onboarding_interviews_active_template_idx
  ON public.onboarding_interviews (user_id, template_id)
  WHERE status IN ('in_progress', 'extracting', 'review');

DROP INDEX IF EXISTS public.onboarding_interviews_active_idx;

COMMIT;
