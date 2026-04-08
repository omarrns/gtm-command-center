-- Phase 9F: Structured scoring profiles for deterministic ranking + user-configurable weights

CREATE TABLE IF NOT EXISTS public.user_scoring_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Layer 1: Stable rubric (derived from onboarding via normalization)
  role_fit_keywords text[] NOT NULL DEFAULT '{}',
  seniority_years integer,
  preferred_stages text[] NOT NULL DEFAULT '{}',
  preferred_domains text[] NOT NULL DEFAULT '{}',
  tool_familiarity text[] NOT NULL DEFAULT '{}',
  proof_points jsonb NOT NULL DEFAULT '[]',
  dealbreaker_patterns text[] NOT NULL DEFAULT '{}',

  -- Layer 2: Dimension weights (0.5-2.0, default 1.0)
  weight_role_fit real NOT NULL DEFAULT 1.0
    CHECK (weight_role_fit BETWEEN 0.5 AND 2.0),
  weight_seniority real NOT NULL DEFAULT 1.0
    CHECK (weight_seniority BETWEEN 0.5 AND 2.0),
  weight_stage real NOT NULL DEFAULT 1.0
    CHECK (weight_stage BETWEEN 0.5 AND 2.0),
  weight_domain real NOT NULL DEFAULT 1.0
    CHECK (weight_domain BETWEEN 0.5 AND 2.0),
  weight_stack real NOT NULL DEFAULT 1.0
    CHECK (weight_stack BETWEEN 0.5 AND 2.0),
  weight_proof_points real NOT NULL DEFAULT 1.0
    CHECK (weight_proof_points BETWEEN 0.5 AND 2.0),
  weight_dealbreaker real NOT NULL DEFAULT 1.0
    CHECK (weight_dealbreaker BETWEEN 0.5 AND 2.0),

  -- Layer 2: Structured preferences
  target_roles text[] NOT NULL DEFAULT '{}',
  target_locations text[] NOT NULL DEFAULT '{}',
  green_flags text[] NOT NULL DEFAULT '{}',
  red_flags text[] NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS: users can read their own row; all writes via service-role actions
ALTER TABLE user_scoring_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own scoring profile" ON user_scoring_profiles;
CREATE POLICY "Users select own scoring profile" ON user_scoring_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_scoring_profile_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scoring_profile_updated_at ON user_scoring_profiles;
CREATE TRIGGER scoring_profile_updated_at
  BEFORE UPDATE ON user_scoring_profiles
  FOR EACH ROW EXECUTE FUNCTION update_scoring_profile_updated_at();
