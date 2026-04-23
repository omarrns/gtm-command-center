-- Widen opportunities.source CHECK constraint to match OpportunitySource
-- in src/lib/supabase/types.ts. Before this migration the init CHECK only
-- permitted ('jsearch','exa','manual'), so the TheirStack webhook lane
-- (source='theirstack') and the dormant ICP discovery lane
-- (source='exa-dormant', SPEC-4 Phase 4) both failed with a check
-- violation on insert.

ALTER TABLE public.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_source_check;

ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_source_check
  CHECK (source IN ('jsearch', 'exa', 'manual', 'theirstack', 'exa-dormant'));
