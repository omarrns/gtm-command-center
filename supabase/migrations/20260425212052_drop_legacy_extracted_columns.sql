-- Drop the four legacy job_search-shaped extraction columns from
-- onboarding_interviews. Their content has been the unified `extracted`
-- JSONB column since Phase 1.b (migration 20260421200001) which dual-wrote
-- them, and that backfill copied prior rows in the same migration.
--
-- All consumers now read/write through `extracted` only. Tracked in
-- docs/DEFERRED.md "Drop legacy extracted_* columns".

BEGIN;

-- Belt-and-braces backfill: any row where `extracted` is still NULL but a
-- legacy column has data (rolled back from a partial state, or inserted
-- between the unified migration and now without going through the
-- dual-write code path) gets reassembled from the four legacy columns
-- before the columns are dropped.
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

ALTER TABLE public.onboarding_interviews
  DROP COLUMN IF EXISTS extracted_profile,
  DROP COLUMN IF EXISTS extracted_search,
  DROP COLUMN IF EXISTS extracted_outreach,
  DROP COLUMN IF EXISTS extracted_insights;

COMMIT;
