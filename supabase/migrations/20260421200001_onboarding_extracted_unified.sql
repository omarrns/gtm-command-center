-- SPEC-3 Phase 1.a: unified `extracted` JSONB column on onboarding_interviews
--
-- Today the table carries four template-specific JSONB columns:
--   extracted_profile, extracted_search, extracted_outreach, extracted_insights
-- all keyed to the job_search template's shape. Phase 3 introduces
-- icp_definition, whose extraction is a different shape — we can't keep
-- adding columns per template.
--
-- This migration:
--   1. Adds a nullable `extracted` JSONB column.
--   2. Backfills it from the four legacy columns for every existing row so
--      readers can switch over without dual-reading legacy data.
--
-- The four legacy columns stay for one release as a dual-write safety net.
-- Phase 1.b adds dual-writes; a future cleanup commit drops the legacy
-- columns once Phase 3 stabilises in prod (tracked in docs/DEFERRED.md).

BEGIN;

ALTER TABLE public.onboarding_interviews
  ADD COLUMN IF NOT EXISTS extracted jsonb;

-- Reassemble the job_search-shaped extraction from the four legacy columns
-- for any row that hasn't been populated yet. Idempotent via WHERE extracted
-- IS NULL — re-running this migration (or a partial replay) doesn't overwrite
-- anything a consumer may have written.
UPDATE public.onboarding_interviews
SET extracted = jsonb_build_object(
      'profile', coalesce(extracted_profile, '{}'::jsonb),
      'search', coalesce(extracted_search, '{}'::jsonb),
      'outreach', coalesce(extracted_outreach, '{}'::jsonb),
      'insights', coalesce(extracted_insights, '{}'::jsonb)
    )
WHERE extracted IS NULL
  AND (
    extracted_profile IS NOT NULL
    OR extracted_search IS NOT NULL
    OR extracted_outreach IS NOT NULL
    OR extracted_insights IS NOT NULL
  );

COMMIT;
