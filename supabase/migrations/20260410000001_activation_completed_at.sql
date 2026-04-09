-- Phase 11: Track whether the post-onboarding activation search has been
-- completed or dismissed, preventing repeated redirects to /activate.
ALTER TABLE public.pipeline_config
  ADD COLUMN IF NOT EXISTS activation_completed_at timestamptz;
