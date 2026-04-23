-- SPEC-3 Phase 2.b: user_scoring_profiles.icp_rubric
--
-- Nullable JSONB column. Job-seeker rows leave it NULL; GTM rows populate
-- it via icp_definition's normalizeScoringProfile (Phase 3) and leave the
-- job-search-shaped columns (role_fit_keywords, seniority_years,
-- preferred_stages, etc.) NULL.
--
-- Unified JSONB rather than per-column additions because the ICP rubric
-- shape is meaningfully richer than scalar columns — firmographics,
-- technographics, signals, disqualifiers, buyer_personas each carry
-- nested structure.

BEGIN;

ALTER TABLE public.user_scoring_profiles
  ADD COLUMN IF NOT EXISTS icp_rubric jsonb;

COMMIT;
