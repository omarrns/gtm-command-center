-- SPEC-3 Phase 2.a: dual-persona schema additions
--
-- Lands the schema for job_seeker/gtm fork. No code reads these yet except
-- profiles.user_type — the GTM opportunity columns are stored-but-unused in
-- SPEC-3 v1 (no pipeline surface ships for GTM users; tracked in DEFERRED.md).
--
-- Changes:
--   1. profiles.user_type enum ('job_seeker' | 'gtm'), nullable. Written
--      only by performConfirm after a successful onboarding confirm.
--   2. opportunities.role_title relaxed to nullable so the table can carry
--      GTM target accounts in a future SPEC (no code writes GTM rows yet).
--   3. opportunities.company_domain + trigger_signals + buyer_personas —
--      schema-only GTM shape reservations.
--   4. onboarding_artifacts.interview_id FK relaxed from ON DELETE CASCADE
--      to ON DELETE SET NULL. Supports pre-confirm persona switch: when a
--      user abandons a mis-picked interview, the artifacts must survive
--      so the new interview can reclaim them.
--   5. Backfill user_type='job_seeker' for existing confirmed users
--      (anyone with a pipeline_config row today was a job seeker by
--      construction — the only flow that writes pipeline_config).

BEGIN;

-- 1. profiles.user_type
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_type text
    CHECK (user_type IS NULL OR user_type IN ('job_seeker', 'gtm'));

-- 2. + 3. opportunities GTM shape
ALTER TABLE public.opportunities
  ALTER COLUMN role_title DROP NOT NULL;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS company_domain text,
  ADD COLUMN IF NOT EXISTS trigger_signals jsonb,
  ADD COLUMN IF NOT EXISTS buyer_personas jsonb;

-- 4. Relax onboarding_artifacts FK to SET NULL
ALTER TABLE public.onboarding_artifacts
  DROP CONSTRAINT IF EXISTS onboarding_artifacts_interview_id_fkey;

ALTER TABLE public.onboarding_artifacts
  ADD CONSTRAINT onboarding_artifacts_interview_id_fkey
  FOREIGN KEY (interview_id)
  REFERENCES public.onboarding_interviews(id)
  ON DELETE SET NULL;

-- 5. Backfill existing confirmed users as job_seeker. Any user with a
-- pipeline_config row today reached it via the job_search flow — there is
-- no other path that writes pipeline_config. Idempotent: only writes rows
-- where user_type is currently NULL.
UPDATE public.profiles
SET user_type = 'job_seeker'
WHERE user_type IS NULL
  AND user_id IN (SELECT user_id FROM public.pipeline_config);

COMMIT;
