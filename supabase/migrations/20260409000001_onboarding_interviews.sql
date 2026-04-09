-- Phase 10: Onboarding interviews table for AI career-coach interview flow
CREATE TABLE IF NOT EXISTS public.onboarding_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'extracting', 'review', 'confirmed', 'abandoned')),
  ready_for_extraction boolean NOT NULL DEFAULT false,
  extracted_profile jsonb,
  extracted_search jsonb,
  extracted_outreach jsonb,
  extracted_insights jsonb,
  topics_covered text[] NOT NULL DEFAULT '{}',
  is_refresh boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active interview per user
CREATE UNIQUE INDEX onboarding_interviews_active_idx
  ON onboarding_interviews (user_id)
  WHERE status IN ('in_progress', 'extracting', 'review');

ALTER TABLE onboarding_interviews ENABLE ROW LEVEL SECURITY;

-- Read-only for client; all writes via service-role (server actions + route handlers)
CREATE POLICY "Users select own interviews" ON onboarding_interviews
  FOR SELECT USING (auth.uid() = user_id);
