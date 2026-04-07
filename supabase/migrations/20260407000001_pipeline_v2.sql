-- Pipeline V2: Core tables, indexes, triggers, ownership enforcement

-- Pipeline configuration (one row per user)
CREATE TABLE IF NOT EXISTS public.pipeline_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  score_threshold integer NOT NULL DEFAULT 70
    CHECK (score_threshold >= 0 AND score_threshold <= 100),
  search_queries jsonb NOT NULL DEFAULT '["GTM Engineer", "Growth Engineer"]'
    CHECK (jsonb_array_length(search_queries) <= 10),
  search_locations jsonb NOT NULL DEFAULT '["San Francisco", "New York"]'
    CHECK (jsonb_array_length(search_locations) <= 10),
  daily_send_cap integer NOT NULL DEFAULT 10
    CHECK (daily_send_cap >= 0 AND daily_send_cap <= 50),
  gmail_send_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Gmail credentials table (separate from config, never exposed to client)
CREATE TABLE IF NOT EXISTS public.gmail_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  encrypted_refresh_token text NOT NULL,
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Core pipeline table
CREATE TABLE IF NOT EXISTS public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  source text NOT NULL CHECK (source IN ('jsearch', 'exa', 'manual')),
  external_id text NOT NULL,
  company_name text NOT NULL,
  role_title text NOT NULL,
  job_url text,
  job_description text,
  stage text NOT NULL DEFAULT 'discovered'
    CHECK (stage IN ('discovered','scored','filtered','researched',
      'needs_contact','enriched','drafted','queued','sending',
      'sent','replied','skipped')),
  score integer CHECK (score >= 0 AND score <= 100),
  score_components jsonb,
  analysis_id uuid REFERENCES analyses(id),
  research_id uuid REFERENCES research_reports(id),
  selected_draft_id uuid REFERENCES email_drafts(id),
  recipient_name text,
  recipient_title text,
  recipient_email text,
  recipient_webset_item_id text,
  gmail_thread_id text,
  gmail_message_id text,
  sent_at timestamptz,
  enrichment_attempts integer NOT NULL DEFAULT 0,
  max_enrichment_attempts integer NOT NULL DEFAULT 3,
  processing_started_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_opportunities_user_stage ON opportunities(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_user_date ON opportunities(user_id, discovered_at DESC);

-- Add opportunity_id to email_drafts for reliable variant linking
ALTER TABLE public.email_drafts ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES opportunities(id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_opportunity ON email_drafts(opportunity_id);

-- Cross-table ownership trigger
CREATE OR REPLACE FUNCTION check_opportunity_ownership() RETURNS trigger AS $$
BEGIN
  IF NEW.analysis_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.analysis_id IS DISTINCT FROM OLD.analysis_id) THEN
    IF NOT EXISTS (SELECT 1 FROM analyses WHERE id = NEW.analysis_id AND user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'analysis_id does not belong to this user';
    END IF;
  END IF;

  IF NEW.research_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.research_id IS DISTINCT FROM OLD.research_id) THEN
    IF NOT EXISTS (SELECT 1 FROM research_reports WHERE id = NEW.research_id AND user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'research_id does not belong to this user';
    END IF;
  END IF;

  IF NEW.selected_draft_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.selected_draft_id IS DISTINCT FROM OLD.selected_draft_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM email_drafts
      WHERE id = NEW.selected_draft_id
        AND user_id = NEW.user_id
        AND opportunity_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'selected_draft_id does not belong to this user/opportunity';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_opportunity_ownership_trigger ON opportunities;
CREATE TRIGGER check_opportunity_ownership_trigger
  BEFORE INSERT OR UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION check_opportunity_ownership();

-- Company watchlist
CREATE TABLE IF NOT EXISTS public.watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  company_name text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('auto', 'manual')),
  webset_id text,
  last_alert_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_name)
);

-- Watchlist alerts
CREATE TABLE IF NOT EXISTS public.watchlist_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN (
    'funding','hire','launch','press','job_posting','leadership_change')),
  title text NOT NULL,
  summary text,
  source_url text,
  source_item_id text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(watchlist_id, source_item_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_alerts_watchlist ON watchlist_alerts(watchlist_id, detected_at DESC);

-- RLS
ALTER TABLE pipeline_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_alerts ENABLE ROW LEVEL SECURITY;

-- pipeline_config: read-only for users, updates via service client
DROP POLICY IF EXISTS "Users select own config" ON pipeline_config;
CREATE POLICY "Users select own config" ON pipeline_config
  FOR SELECT USING (auth.uid() = user_id);

-- gmail_credentials: NO client-side access (service-role only)

-- opportunities: read-only for users, mutations via server actions
DROP POLICY IF EXISTS "Users select own opportunities" ON opportunities;
CREATE POLICY "Users select own opportunities" ON opportunities
  FOR SELECT USING (auth.uid() = user_id);

-- watchlist: select + insert + delete for authenticated user
DROP POLICY IF EXISTS "Users select own watchlist" ON watchlist;
CREATE POLICY "Users select own watchlist" ON watchlist
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own watchlist" ON watchlist;
CREATE POLICY "Users insert own watchlist" ON watchlist
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own watchlist" ON watchlist;
CREATE POLICY "Users delete own watchlist" ON watchlist
  FOR DELETE USING (auth.uid() = user_id);

-- watchlist_alerts: read-only via parent watchlist ownership
DROP POLICY IF EXISTS "Users select own alerts" ON watchlist_alerts;
CREATE POLICY "Users select own alerts" ON watchlist_alerts
  FOR SELECT USING (watchlist_id IN (
    SELECT id FROM watchlist WHERE user_id = auth.uid()
  ));

-- Updated_at triggers (reuse existing set_updated_at function)
DROP TRIGGER IF EXISTS set_pipeline_config_updated_at ON pipeline_config;
CREATE TRIGGER set_pipeline_config_updated_at
  BEFORE UPDATE ON pipeline_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_gmail_credentials_updated_at ON gmail_credentials;
CREATE TRIGGER set_gmail_credentials_updated_at
  BEFORE UPDATE ON gmail_credentials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_opportunities_updated_at ON opportunities;
CREATE TRIGGER set_opportunities_updated_at
  BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Atomic send cap reservation (Phase 3 approval flow)
CREATE OR REPLACE FUNCTION reserve_send_slot(
  p_opportunity_id uuid, p_user_id uuid
) RETURNS boolean AS $$
DECLARE
  v_cap integer;
  v_used integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || current_date::text));

  SELECT count(*) INTO v_used FROM opportunities
  WHERE user_id = p_user_id
    AND (sent_at >= current_date OR stage = 'sending');

  SELECT daily_send_cap INTO v_cap FROM pipeline_config
  WHERE user_id = p_user_id;

  IF v_used >= COALESCE(v_cap, 10) THEN
    RETURN false;
  END IF;

  UPDATE opportunities SET stage = 'sending', updated_at = now()
  WHERE id = p_opportunity_id AND user_id = p_user_id AND stage = 'queued';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
