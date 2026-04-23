-- Career Story screen: add `story_review` status between review and confirmed.
-- The story screen streams insights via Opus (~30s) AFTER the user clicks
-- "Continue to story" on the review screen. Confirm becomes instant because
-- insights are persisted into extracted_insights / extracted.insights before
-- the user clicks "Save & finish".

-- 1. Extend status check constraint with the new value
ALTER TABLE public.onboarding_interviews
  DROP CONSTRAINT IF EXISTS onboarding_interviews_status_check;

ALTER TABLE public.onboarding_interviews
  ADD CONSTRAINT onboarding_interviews_status_check
  CHECK (status IN (
    'in_progress', 'extracting', 'review',
    'story_review', 'confirmed', 'abandoned'
  ));

-- 2. Rebuild active-interview unique index to include story_review.
-- Same per-template scoping introduced in 20260420000001_interview_template_id.
DROP INDEX IF EXISTS public.onboarding_interviews_active_template_idx;

CREATE UNIQUE INDEX onboarding_interviews_active_template_idx
  ON public.onboarding_interviews (user_id, template_id)
  WHERE status IN ('in_progress', 'extracting', 'review', 'story_review');
