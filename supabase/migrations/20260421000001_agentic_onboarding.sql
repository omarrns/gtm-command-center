-- SPEC-2 Phase 1: agentic onboarding schema
-- Adds orchestrator_state to onboarding_interviews and creates onboarding_artifacts
--
-- Idempotent: safe to re-run. The ghost migration 20260421173514 on the
-- remote added orchestrator_state independently; IF NOT EXISTS guards let
-- this file be the canonical source of truth without aborting the TX.

BEGIN;

ALTER TABLE public.onboarding_interviews
  ADD COLUMN IF NOT EXISTS orchestrator_state jsonb;

CREATE TABLE IF NOT EXISTS public.onboarding_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interview_id uuid REFERENCES public.onboarding_interviews(id) ON DELETE CASCADE,
  kind text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('url', 'file', 'text')),
  source_label text,
  source_url text,
  file_name text,
  mime_type text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  normalized_markdown text,
  error_message text,
  created_from_template_id text NOT NULL DEFAULT 'job_search',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_artifacts_user_id_idx
  ON public.onboarding_artifacts (user_id);

CREATE INDEX IF NOT EXISTS onboarding_artifacts_interview_id_idx
  ON public.onboarding_artifacts (interview_id)
  WHERE interview_id IS NOT NULL;

ALTER TABLE public.onboarding_artifacts ENABLE ROW LEVEL SECURITY;

-- Read-only for client; mutations go through service-role (server actions + route handlers)
DROP POLICY IF EXISTS "Users select own artifacts" ON public.onboarding_artifacts;
CREATE POLICY "Users select own artifacts" ON public.onboarding_artifacts
  FOR SELECT USING (auth.uid() = user_id);

COMMIT;
