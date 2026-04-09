# GTM Command Center v2 — Implementation Plan

## Context

The current GTM Command Center (v1) is a manual skill-invocation UI with 7+ separate pages. The PRD calls for transforming it into an **autonomous job search agent** — a daily cron pipeline that discovers roles, scores them, researches contacts, drafts cold emails, and queues everything for approval. The UI shrinks from 7 modules to 3 views (Today / History / Watchlist) + Settings.

The existing codebase has strong foundations to reuse: job queue, skill handlers, Exa/Anthropic integrations, memory context system, and the JSearch script.

**Review status:** Plan reviewed by Codex three times. All accepted findings incorporated below.

---

## Phase 0: Pre-Build Validation (1 day)

**Goal:** De-risk the Exa Websets email enrichment before committing to the architecture.

### 0.1 — Exa Email Enrichment Spike

- Run a manual 10-company test using Exa Websets enrichment API to find CEO + hiring manager work emails
- Measure hit rate — if < 50%, plan Apollo/Hunter fallback for Phase 4
- **File:** `scripts/test-exa-enrichment.ts` (throwaway spike script)
- **Depends on:** EXA_API_KEY already configured

### 0.2 — Exa Websets People Search Spike

- Test Exa Websets people search (not plain Exa search) to find CEO + hiring manager as Webset items
- Verify items have a stable `item_id` that can be passed to the enrichment step
- This validates the PRD requirement: research must produce Webset person items, not synthesized JSON

### 0.3 — Gmail API Feasibility Check

- Confirm Google Cloud project setup for Gmail API OAuth
- Identify scopes needed: `gmail.send`, `gmail.metadata` (metadata-only for reply tracking — avoids reading message bodies)
- Validate PKCE flow support for the Google OAuth client
- Note: Gmail integration is Phase 4 — this is just a feasibility check

---

## Phase 1: Schema + Config + Security Foundation (1-2 days)

**Goal:** New database tables with proper security constraints, seed default config, port JSearch to TypeScript.

### 1.1 — Database Migration: New Tables

**File:** `gtm-command-center/supabase/migrations/YYYYMMDD_pipeline_v2.sql`

```sql
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
  external_id text NOT NULL,  -- always required (generated for manual source)
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
  recipient_webset_item_id text,  -- Exa Webset person item ID for enrichment
  gmail_thread_id text,
  gmail_message_id text,  -- idempotency: prevent duplicate sends
  sent_at timestamptz,
  enrichment_attempts integer NOT NULL DEFAULT 0,  -- retry cutoff for email discovery
  max_enrichment_attempts integer NOT NULL DEFAULT 3,
  processing_started_at timestamptz,  -- row-level lock for pipeline runs
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Stable dedup: external_id is always non-null
  UNIQUE(user_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_opportunities_user_stage ON opportunities(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_user_date ON opportunities(user_id, discovered_at DESC);

-- Add opportunity_id to email_drafts for reliable variant linking
ALTER TABLE public.email_drafts ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES opportunities(id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_opportunity ON email_drafts(opportunity_id);

-- Cross-table ownership trigger: ensure linked rows share user_id AND opportunity_id
CREATE OR REPLACE FUNCTION check_opportunity_ownership() RETURNS trigger AS $$
BEGIN
  -- On INSERT, OLD is not available — only validate non-null FKs
  -- On UPDATE, only validate changed FKs (IS DISTINCT FROM OLD)

  -- Validate analysis_id ownership
  IF NEW.analysis_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.analysis_id IS DISTINCT FROM OLD.analysis_id) THEN
    IF NOT EXISTS (SELECT 1 FROM analyses WHERE id = NEW.analysis_id AND user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'analysis_id does not belong to this user';
    END IF;
  END IF;

  -- Validate research_id ownership
  IF NEW.research_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.research_id IS DISTINCT FROM OLD.research_id) THEN
    IF NOT EXISTS (SELECT 1 FROM research_reports WHERE id = NEW.research_id AND user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'research_id does not belong to this user';
    END IF;
  END IF;

  -- Validate selected_draft_id ownership AND opportunity match
  IF NEW.selected_draft_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.selected_draft_id IS DISTINCT FROM OLD.selected_draft_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM email_drafts
      WHERE id = NEW.selected_draft_id
        AND user_id = NEW.user_id
        AND opportunity_id = NEW.id  -- draft must belong to THIS opportunity
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
  source_item_id text NOT NULL,  -- dedup key from Exa Webset item (required, no NULL dedup bypass)
  detected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(watchlist_id, source_item_id)  -- prevent duplicate alerts on re-ingestion
);

CREATE INDEX IF NOT EXISTS idx_watchlist_alerts_watchlist ON watchlist_alerts(watchlist_id, detected_at DESC);

-- RLS policies (per-operation, matching existing pattern in 20260405000001_init.sql)
ALTER TABLE pipeline_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_alerts ENABLE ROW LEVEL SECURITY;

-- pipeline_config: users can read only — all updates via server actions with service client
DROP POLICY IF EXISTS "Users select own config" ON pipeline_config;
CREATE POLICY "Users select own config" ON pipeline_config
  FOR SELECT USING (auth.uid() = user_id);
-- NO UPDATE policy — updates go through server actions using service client

-- gmail_credentials: NO client-side access — service-role only
-- (no RLS policy = deny all for authenticated users, service client bypasses)

-- opportunities: users can read, but all mutations go through server actions
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

-- watchlist_alerts: read-only for users (pipeline inserts via service client)
DROP POLICY IF EXISTS "Users select own alerts" ON watchlist_alerts;
CREATE POLICY "Users select own alerts" ON watchlist_alerts
  FOR SELECT USING (watchlist_id IN (
    SELECT id FROM watchlist WHERE user_id = auth.uid()
  ));

-- Triggers (reuse existing set_updated_at function)
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
```

**Key security features:**

- `external_id` is `NOT NULL` — manual sources generate a UUID. Prevents NULL dedup bypass.
- Cross-table ownership enforced at DB level via `check_opportunity_ownership()` trigger.
- `pipeline_config` has NO client UPDATE policy — all updates via server actions with service client.
- `gmail_credentials` has NO client RLS policies at all.
- `email_drafts` gets `opportunity_id` column for reliable variant linking.
- `enrichment_attempts` + `max_enrichment_attempts` prevent infinite retry loops on email discovery.
- `approved` stage removed from enum — flow is `queued` → `sending` → `sent` (no ambiguity).
- All indexes and triggers use `IF NOT EXISTS` / `DROP ... IF EXISTS` for safe re-runs.
- DB-level CHECK constraints on `search_queries`/`search_locations` array length.

### 1.2 — TypeScript Types

**File:** `gtm-command-center/src/lib/supabase/types.ts` (extend existing)

Add interfaces: `PipelineConfigRow`, `GmailCredentialsRow`, `OpportunityRow`, `WatchlistRow`, `WatchlistAlertRow`
Add stage type: `OpportunityStage` (no `approved` — stages are: discovered, scored, filtered, researched, needs_contact, enriched, drafted, queued, sending, sent, replied, skipped)

### 1.3 — Seed Default Config

**File:** `gtm-command-center/scripts/seed-pipeline-config.ts`

Insert default `pipeline_config` row for Omar's user_id with:

- score_threshold: 70
- search_queries: ["GTM Engineer", "Growth Engineer", "Revenue Engineer"]
- search_locations: ["San Francisco", "New York", "Remote"]
- daily_send_cap: 10

### 1.4 — Update .env.example

**File:** `gtm-command-center/.env.example` (modify)

Add required new env vars:

```
RAPIDAPI_KEY=              # JSearch API key (RapidAPI)
CRON_SECRET=               # Bearer token for cron endpoints
GOOGLE_CLIENT_ID=          # Gmail OAuth client ID
GOOGLE_CLIENT_SECRET=      # Gmail OAuth client secret
TOKEN_ENCRYPTION_KEY=      # 32-byte hex key for encrypting Gmail refresh tokens
```

### 1.5 — Port JSearch to TypeScript

**File:** `gtm-command-center/src/lib/pipeline/jsearch.ts` (new)

Port `scripts/search-gtm-jobs.mjs` logic into a reusable module:

- `searchJobs(queries: string[], locations: string[]): Promise<JSearchResult[]>`
- Dedupe by external_id (job_id from API)
- Return structured objects (not markdown)
- Keep the original script as-is for manual use

**Reuses:** RAPIDAPI_KEY from env

### 1.6 — Extract Pure Scoring/Research Functions

**Before building the pipeline runner**, extract the core logic from existing job handlers into pure functions that don't depend on `JobRow` payloads:

**File:** `gtm-command-center/src/lib/pipeline/scoring.ts` (new)

Extract from `src/lib/jobs/handlers/full-analysis.ts`:

- `scoreOpportunity(companyName, roleTitle, jobDescription, userId): Promise<ScoringResult>`
- Takes raw inputs, not a JobRow
- Calls `exaFindCompany()` + `loadMemoryContext()` + `runClaudeJson()` with full-analysis prompt
- Returns `{ jdFit, strategicFit, normalizedScore, analysisResult }`

**File:** `gtm-command-center/src/lib/pipeline/people-search.ts` (new)

Extract from `src/lib/jobs/handlers/people-research.ts`:

- `researchPeople(companyName, roleTitle, userId): Promise<ResearchResult>`
- Takes raw inputs, not a JobRow
- Returns `{ recipientName, recipientTitle, recipientWebsetItemId, researchResult }`

The existing job handlers (`src/lib/jobs/handlers/`) continue to work for manual invocation via the UI — they call these extracted functions internally.

### 1.7 — Opportunity Helpers

**File:** `gtm-command-center/src/lib/pipeline/opportunities.ts` (new)

- `createOpportunity(userId, data)` — `external_id` is required (JSearch provides job*id; manual sources generate `manual*${uuid}`). Insert with ON CONFLICT DO NOTHING on `(user_id, source, external_id)`. App-side 30-day check: query for existing opportunity with same company_name + role_title within last 30 days before inserting.
- `claimOpportunity(id, userId)` — atomic claim using `UPDATE ... SET processing_started_at = now(), attempt_count = attempt_count + 1 WHERE processing_started_at IS NULL OR processing_started_at < now() - interval '10 minutes'` (stale claim recovery). Always scope to `user_id`.
- `advanceStage(id, userId, expectedStage, newStage, updates)` — conditional update with stage precondition (`WHERE stage = expectedStage AND user_id = userId`). Returns boolean success. Prevents race conditions.
- `releaseOpportunity(id, userId)` — clear `processing_started_at` after processing.
- `getOpportunitiesByDate(userId, date)` — for Today view
- `getOpportunitiesHistory(userId, filters)` — for History view

---

## Phase 2: Pipeline Orchestration (3-4 days)

**Goal:** The autonomous pipeline that chains discover → score → filter → research → enrich → draft → queue.

### 2.1 — Pipeline Runner

**File:** `gtm-command-center/src/lib/pipeline/runner.ts` (new)

The pipeline runner processes opportunities through stages sequentially. It's called by the cron endpoint and processes ALL opportunities for a user that are eligible to advance.

```
async function runPipeline(userId: string): Promise<PipelineRunResult>
  1. Load pipeline_config for user
  2. DISCOVER: call discoverNewRoles() → insert as 'discovered' (max 10 per run)
  3. For each opportunity at 'discovered' (max 5 per run):
     a. claimOpportunity() — skip if already claimed
     b. SCORE via scoreOpportunity()
     c. releaseOpportunity()
  4. For each at 'scored' with score >= threshold (max 3 per run):
     a. claimOpportunity()
     b. RESEARCH via researchPeople()
     c. releaseOpportunity()
  5. For each at 'researched' with contacts AND enrichment_attempts < max_enrichment_attempts:
     a. claimOpportunity()
     b. ENRICH — increment enrichment_attempts
     c. releaseOpportunity()
  6. For each at 'enriched' with email (max 5 per run):
     a. claimOpportunity()
     b. DRAFT
     c. releaseOpportunity()
  7. For each at 'drafted': advance to QUEUED
  Return summary stats
```

**Key design decisions:**

- Pipeline runs synchronously within a single Vercel Function invocation (up to 300s timeout)
- **Per-stage batch limits:** 10 discoveries, 5 scorings, 3 research, 5 drafts (manages API cost and timeout)
- Each step claims the opportunity row before processing (prevents overlapping runs from double-processing)
- Each step uses `advanceStage()` with stage precondition (atomic, idempotent)
- If the function times out mid-pipeline, unclaimed opportunities stay at their current stage and get picked up on next run. Stale claims (>10 min) are auto-recovered.
- Error in one opportunity doesn't block others (try/catch per opportunity, error logged to `last_error`)
- Enrichment has a retry cutoff: after `max_enrichment_attempts` (default 3) failures, opportunity stays at 'researched' and is flagged `needs_contact` for manual lookup

### 2.2 — Pipeline Steps (individual modules)

**File:** `gtm-command-center/src/lib/pipeline/steps/discover.ts`

- Calls `searchJobs()` from Phase 1.5
- For each result: `createOpportunity()` with source='jsearch', external_id=job_id
- Dedup handled by unique constraint + app-side 30-day check
- Returns count of new discoveries

**File:** `gtm-command-center/src/lib/pipeline/steps/score.ts`

- Calls `scoreOpportunity()` from Phase 1.6 (extracted pure function, not raw job handler)
- **Prompt injection mitigation:** External JD content wrapped in explicit delimiters (`<external_jd>...</external_jd>`) with instruction to treat as data, not instructions. Memory context bounded to essential fields only (no raw file dumps).
- Computes normalized score: `round(((jd_fit/35)*0.6 + (strategic_fit/30)*0.4)*100)`
- Creates `analyses` row (reuses existing table), links via `analysis_id`
- Ownership enforced by DB trigger `check_opportunity_ownership()`
- Advances to 'scored' or 'filtered' based on threshold
- If score >= 80: auto-add company to watchlist with source='auto'

**File:** `gtm-command-center/src/lib/pipeline/steps/research.ts`

- Calls `researchPeople()` from Phase 1.6 (extracted pure function)
- **Uses Exa Websets people search** (not plain Exa search) to find CEO/hiring manager as Webset items
- Stores `recipient_webset_item_id` on opportunity for enrichment step
- Creates `research_reports` row, links via `research_id`
- Ownership enforced by DB trigger
- Extracts recipient_name + recipient_title from research result
- Advances to 'researched' or 'needs_contact'

**File:** `gtm-command-center/src/lib/pipeline/steps/enrich.ts`

- Uses `recipient_webset_item_id` to run Exa Websets enrichment on the selected person item
- Increments `enrichment_attempts` on each try
- If email found: updates `recipient_email`, advances to 'enriched'
- If no email found AND `enrichment_attempts < max_enrichment_attempts`: stays at 'researched' (will retry next run)
- If no email found AND `enrichment_attempts >= max_enrichment_attempts`: advances to 'needs_contact' (flagged for manual lookup, no more retries)

**File:** `gtm-command-center/src/lib/pipeline/steps/draft.ts`

- Auto-routes by recipient_title keywords:
  - CEO/Founder/CTO/Co-founder → email-b2b-customer-support prompt
  - VP/Head of/Director/Growth/Marketing → email-head-of-growth prompt
- **Privacy control:** Email drafts must not include raw memory content (positioning, dealbreakers). Skills already handle this via their prompt structure — verify during implementation.
- Creates `email_drafts` rows with `opportunity_id` set (reliable variant linking)
- Sets `selected_draft_id` on opportunity to first variant
- Ownership enforced by DB trigger
- Advances to 'drafted' → 'queued'

### 2.3 — Cron Endpoint

**File:** `gtm-command-center/src/app/api/cron/pipeline/route.ts` (new)

```typescript
export async function GET(request: Request) {
  // Auth: fail-closed if CRON_SECRET is missing or mismatched
  // (matches existing /api/worker/claim pattern)
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Server misconfigured", { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Load all users with pipeline_config (service client)
  // For each user: runPipeline(userId)
  // Return minimal summary (no sensitive data in response)
  return Response.json({ ok: true, processed: count });
}
```

**File:** `gtm-command-center/vercel.json` (new or extend existing)

```json
{
  "crons": [
    { "path": "/api/cron/pipeline", "schedule": "0 10 * * *" },
    { "path": "/api/cron/replies", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/watchlist", "schedule": "0 11 * * *" }
  ]
}
```

Note: `0 10 * * *` UTC = 6:00 AM EDT (April–November). During EST (November–March), this runs at 5:00 AM ET. Acceptable seasonal drift for a daily job search pipeline.

### 2.4 — Manual Pipeline Trigger

**File:** `gtm-command-center/src/app/api/pipeline/run/route.ts` (new)

POST endpoint to trigger pipeline manually from UI. Authenticated via `requireUser()` — uses the authenticated user's ID (never accepts client-supplied user_id). Same pipeline logic as cron but single-user scoped.

**Reuses:**

- `src/lib/ai/anthropic.ts` — runClaudeJson, runClaudeText
- `src/lib/ai/exa.ts` — exaSearch, exaFindCompany
- `src/lib/skills/context.ts` — loadMemoryContext, formatMemoryForPrompt
- `src/lib/pipeline/scoring.ts` — extracted scoring function
- `src/lib/pipeline/people-search.ts` — extracted research function
- `src/lib/supabase/service.ts` — service client for pipeline writes (always scoped to authenticated user_id)

---

## Phase 3: Today + History UI (3-4 days)

**Goal:** Replace v1 multi-module UI with the Today and History views.

### 3.1 — New Layout

**File:** `gtm-command-center/src/app/(app)/layout.tsx` (modify)

Replace 7-item sidebar with minimal nav:

- **Today** (home) / **History** / **Watchlist** / **Settings**
- Keep the same auth wrapper and profile check

### 3.2 — Today View (Home)

**File:** `gtm-command-center/src/app/(app)/page.tsx` (modify — currently redirects to /analysis)

- Summary bar: `5 found · 3 scored 70+ · 2 emails queued`
- "Run Pipeline Now" button (calls manual trigger endpoint)
- Pipeline cards list (grouped by stage)

**File:** `gtm-command-center/src/app/(app)/_components/opportunity-card.tsx` (new)

Each card shows:

- Company name + role title + normalized score (color-coded)
- Stage badge (discovered → scored → researched → drafted → queued → sent)
- Expandable detail section:
  - Full analysis summary (from linked analyses row)
  - Research summary (from linked research_reports row)
  - Email draft with variant picker (from linked email_drafts via `opportunity_id`)
- Action buttons: **Approve** / **Edit & Approve** / **Skip** / **Flag Company**

**File:** `gtm-command-center/src/app/(app)/_components/email-variant-picker.tsx` (new)

- Queries email_drafts by `opportunity_id` (reliable FK, not heuristic company/recipient match)
- Select one → updates selected_draft_id on opportunity
- Inline edit capability before approving

**File:** `gtm-command-center/src/app/(app)/actions.ts` (new — pipeline actions)

- `approveOpportunityAction(id)` — **Idempotent send flow with atomic cap reservation:**
  1. `requireUser()` to get authenticated user_id
  2. **Serialized cap check + stage transition** via Supabase RPC function:

  ```sql
   CREATE OR REPLACE FUNCTION reserve_send_slot(
     p_opportunity_id uuid, p_user_id uuid
   ) RETURNS boolean AS $$
   DECLARE
     v_cap integer;
     v_used integer;
   BEGIN
     -- Per-user/day advisory lock serializes concurrent approvals
     PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || current_date::text));

     -- Count sent + currently sending (reserved) today
     SELECT count(*) INTO v_used FROM opportunities
     WHERE user_id = p_user_id
       AND (sent_at >= current_date OR stage = 'sending');

     SELECT daily_send_cap INTO v_cap FROM pipeline_config
     WHERE user_id = p_user_id;

     IF v_used >= COALESCE(v_cap, 10) THEN
       RETURN false;  -- cap reached
     END IF;

     -- Advance queued → sending (stage precondition prevents double-send)
     UPDATE opportunities SET stage = 'sending', updated_at = now()
     WHERE id = p_opportunity_id AND user_id = p_user_id AND stage = 'queued';

     RETURN FOUND;
   END;
   $$ LANGUAGE plpgsql;
  ```

  The advisory lock serializes all approve calls for the same user+day. The count includes both `sent_at` rows AND rows currently in `sending` stage (reserved but not yet sent). If function returns false: cap reached. If row wasn't updated: already sending/sent (idempotent). 3. Send email via Gmail API (Phase 4) 4. Store `gmail_thread_id`, `gmail_message_id`, `sent_at` 5. `advanceStage(id, userId, 'sending', 'sent')` 6. On Gmail failure: `advanceStage(id, userId, 'sending', 'queued')` + set `last_error`

- `skipOpportunityAction(id)` — advance to 'skipped' (with stage precondition)
- `updateSelectedDraftAction(id, draftId)` — change selected variant. Validates `draftId` belongs to same user_id AND same opportunity_id.
- `editDraftAction(draftId, subject, body)` — inline edit before approve. Validates ownership.
- `flagCompanyAction(id)` — add to watchlist + skip opportunity
- `triggerPipelineAction()` — manual pipeline run (calls `/api/pipeline/run` with auth)

### 3.3 — History View

**File:** `gtm-command-center/src/app/(app)/history/page.tsx` (new)

- Scrollable timeline grouped by date
- Each day: summary line (e.g., "Apr 5 — 4 found, 2 emailed, 1 replied")
- Expandable to show opportunity cards (same component as Today)
- Filters: status dropdown, score range slider, company search

**File:** `gtm-command-center/src/app/(app)/history/actions.ts` (new)

- `getHistoryAction(filters)` — paginated query with stage/score/company filters

### 3.4 — Remove v1 Routes

Delete or redirect old routes:

- `/analysis/job`, `/analysis/company`, `/analysis/new` → redirect to `/`
- `/research/new` → remove
- `/outreach/new` → remove
- `/coaching` → remove (stays in Claude Code)
- `/memory` → remove (stays ambient)
- `/trail` → remove
- `/workspace-tools` → remove

Keep `/analysis/[id]` and `/research/reports/[id]` as direct-link detail views (accessible from opportunity cards).

---

## Phase 4: Gmail Integration (2-3 days)

**Goal:** Send approved emails via Gmail API, track replies.

### 4.1 — Gmail OAuth Setup

**File:** `gtm-command-center/src/app/api/auth/gmail/route.ts` (new)

- OAuth 2.0 authorization URL generator with PKCE
- `requireUser()` — must be authenticated before starting OAuth flow
- Generate `state` parameter: signed JWT containing `{ userId, nonce }` stored in httpOnly cookie (CSRF + user binding)
- Scopes: `gmail.send`, `gmail.metadata` (metadata-only — no message body access)
- Redirect URI: `/api/auth/gmail/callback` (hardcoded, not from request)

**File:** `gtm-command-center/src/app/api/auth/gmail/callback/route.ts` (new)

- `requireUser()` — must still be authenticated
- Validate `state` parameter: verify JWT signature, check nonce matches cookie, check userId matches authenticated user
- Exchange code for tokens via PKCE
- Encrypt refresh_token using `TOKEN_ENCRYPTION_KEY` (AES-256-GCM)
- Store in `gmail_credentials` table (service client, NOT pipeline_config)
- Store `gmail_send_address` in `pipeline_config` (display-only, no secrets)
- Redirect to Settings page with success message

### 4.2 — Gmail Client

**File:** `gtm-command-center/src/lib/integrations/gmail.ts` (new)

- `getGmailClient(userId)` — load encrypted token from `gmail_credentials`, decrypt with `TOKEN_ENCRYPTION_KEY`, create authenticated client. Auto-refresh if expired, re-encrypt and store updated token.
- `sendEmail(client, { to, subject, body, from })` — send via Gmail API, return `{ threadId, messageId }`. The `messageId` is stored on the opportunity for idempotency.
- `checkReplies(client, threadIds[])` — batch check for new messages on tracked threads using `gmail.metadata` scope (message count per thread, not body content)
- `revokeToken(userId)` — revoke token with Google + delete from `gmail_credentials`

### 4.3 — Wire Approve → Send

Already defined in Phase 3 `approveOpportunityAction`. The flow:

1. Call `reserve_send_slot(id, userId)` RPC — advisory lock serializes concurrent approvals, counts sent + sending rows, advances `queued` → `sending` only if under cap
2. `getGmailClient(userId)` from `gmail_credentials`
3. `sendEmail()` → get threadId + messageId
4. Store both IDs + `sent_at` on opportunity
5. Advance `sending` → `sent`
6. On failure: revert `sending` → `queued`, log `last_error`

### 4.4 — Reply Tracking Cron

**File:** `gtm-command-center/src/app/api/cron/replies/route.ts` (new)

- Auth: `Authorization: Bearer CRON_SECRET` (fail-closed, same as pipeline cron)
- Runs every 30 minutes (separate from main pipeline cron)
- Fetches all opportunities at 'sent' stage with gmail_thread_id
- `getGmailClient(userId)` for each user with sent opportunities
- Batch checks for replies (metadata only — new message count > 1)
- Updates matched opportunities to 'replied' stage
- Returns minimal response (no sensitive data)

---

## Phase 5: Watchlist (2 days)

**Goal:** Company monitoring via Exa Websets.

### 5.1 — Watchlist Management

**File:** `gtm-command-center/src/lib/pipeline/watchlist.ts` (new)

- `addToWatchlist(userId, companyName, source)` — insert + create Exa Webset monitor. ON CONFLICT DO NOTHING (idempotent).
- `removeFromWatchlist(userId, watchlistId)` — delete watchlist row (CASCADE deletes alerts) + cancel Exa Webset. If Webset cancellation fails, log error but still delete local row (don't block on external failure).
- `processWatchlistAlerts(userId)` — check Exa Websets for new items, insert alert rows with `source_item_id`. ON CONFLICT DO NOTHING on `(watchlist_id, source_item_id)` prevents duplicate alerts.

### 5.2 — Auto-Add on High Score

Handled in `src/lib/pipeline/steps/score.ts` (Phase 2):

- After scoring, if normalized score >= 80: `addToWatchlist(userId, companyName, 'auto')`

### 5.3 — Watchlist UI

**File:** `gtm-command-center/src/app/(app)/watchlist/page.tsx` (new)

- List of watched companies with last alert date
- Alert cards per company (funding, hires, launches, press)
- Manual add company form
- Remove company button

**File:** `gtm-command-center/src/app/(app)/watchlist/actions.ts` (new)

- `addWatchlistAction(companyName)` — `requireUser()`, validate input length, call `addToWatchlist()`
- `removeWatchlistAction(id)` — `requireUser()`, verify ownership, call `removeFromWatchlist()`

### 5.4 — Watchlist Alert Cron

**File:** `gtm-command-center/src/app/api/cron/watchlist/route.ts` (new)

- Auth: `Authorization: Bearer CRON_SECRET` (fail-closed)
- Runs daily (after main pipeline)
- For each user with watchlist entries: `processWatchlistAlerts(userId)`
- Alert dedup via `UNIQUE(watchlist_id, source_item_id)` — safe to re-ingest daily
- Returns minimal response

---

## Phase 6: Settings UI (1 day)

**Goal:** Configure pipeline parameters from the UI.

### 6.1 — Settings Page

**File:** `gtm-command-center/src/app/(app)/settings/page.tsx` (new)

- **Score Threshold:** number input (0-100, default 70)
- **Search Queries:** tag-style input for adding/removing query strings (max 10 queries, max 100 chars each)
- **Search Locations:** tag-style input for locations (max 10 locations, max 100 chars each)
- **Daily Send Cap:** number input (0-50, default 10)
- **Gmail Status:** connected/disconnected indicator + "Connect Gmail" OAuth button + "Disconnect" button
- Note: Cron schedule is fixed in `vercel.json` (6am ET daily). Displayed as read-only info, not editable.

**File:** `gtm-command-center/src/app/(app)/settings/actions.ts` (new)

- `updateConfigAction(updates)` — `requireUser()`, validate all inputs server-side (threshold range, query/location count+length limits, send cap range), update `pipeline_config` via **service client** (no client UPDATE RLS policy exists)
- `disconnectGmailAction()` — `requireUser()`, call `revokeToken(userId)`, clear `gmail_send_address` from `pipeline_config`

---

## Phase 7: Polish + Metrics (1-2 days)

### 7.1 — Dashboard Metrics

Add to Today view header:

- Reply rate (sent → replied conversion)
- Emails sent today / this week (vs. daily cap)
- Average score of sent opportunities (not "approved" — that stage doesn't exist)
- Pipeline funnel visualization (discovered → sent breakdown)

### 7.2 — Loading States

**File:** `gtm-command-center/src/app/(app)/loading.tsx` (modify existing)

- Skeleton cards for opportunity list
- Pipeline running indicator when manual trigger is active

### 7.3 — Error Handling

- Pipeline step failures: log error to `last_error`, increment `attempt_count`, release claim, continue to next opportunity
- Enrichment failures: increment `enrichment_attempts`, stop retrying after `max_enrichment_attempts` (default 3)
- Gmail send failures: revert `sending` → `queued`, log `last_error` in UI, allow retry
- Exa API failures: graceful degradation, skip enrichment step, flag for manual lookup
- Stale claims: opportunities with `processing_started_at` > 10 min ago are auto-released on next pipeline run

---

## Phase 8: Onboarding — Self-Serve User Intake

**Goal:** Replace the hard-coded seed script with a first-run setup wizard that populates the user context the pipeline depends on. Without this, scoring runs blind and drafting produces generic emails.

**Why this is critical:** The pipeline's AI quality (scoring accuracy + email personalization) depends entirely on `memory_documents` (profile, dealbreakers, outreach style) and `pipeline_config` (search queries, locations, thresholds). Today these are seeded from Omar's local `.claude/` files via `npm run seed`. A new user has no path to populate them through the app.

**Design principle:** Onboarding gets the user to first useful pipeline output. Settings tunes the machine afterward. The flow is replayable as a "Profile Refresh" from Settings.

### 8.1 — Onboarding Detection

**File:** `gtm-command-center/src/lib/pipeline/onboarding.ts` (new)

- `isOnboardingComplete(svc, userId)` → `boolean`
- Checks three conditions in parallel (all must be true):
  1. `pipeline_config` row exists for user (Step 2)
  2. `memory_documents` row with `document_key = 'user_profile'` exists (Step 1)
  3. `memory_documents` row with `document_key = 'feedback_outreach_style'` exists (Step 3)
- Why all three: scoring uses `user_profile` + `user_positioning` (`scoring.ts:45`). Drafting also uses `feedback_outreach_style` (`draft.ts:139`). Letting a user past the gate after only Steps 1-2 produces lower-quality drafts. Step 4 (Gmail) is optional — the pipeline can discover/score/draft without it.
- Returns a `{ complete: boolean; completedSteps: number[] }` result so the wizard can resume at the right step.

**File:** `gtm-command-center/src/app/(app)/page.tsx` (modify)

- At the top of `TodayPage()`, after `requireUser()`, call `isOnboardingComplete()`
- If false, `redirect('/onboard')` (from `next/navigation`)
- This is the only gate — other pages (history, watchlist, settings) don't need it since users enter through Today

**File:** `gtm-command-center/src/app/(app)/onboard/page.tsx` (new)

- Server component that checks if already onboarded → redirect to `/` if yes
- Fetches any partially-saved onboarding data to pre-fill the wizard
- Passes existing data + `completedSteps` to `OnboardClient`

### Onboarding State Model

No new table or column. Completion is derived from existing records:

```
Step 1 complete: memory_documents WHERE document_key = 'user_profile' exists
Step 2 complete: pipeline_config row exists
Step 3 complete: memory_documents WHERE document_key = 'feedback_outreach_style' exists
Step 4 complete: gmail_credentials row exists (optional — not required for gate)
```

`isOnboardingComplete()` returns `{ complete, completedSteps }`. The wizard reads `completedSteps` and starts at the first incomplete step. URL supports `?step=N` for deep-linking (dev convenience + back navigation).

**Why derived, not a dedicated column:** Adding `onboarding_completed_at` to a table would require a migration and create a sync risk (column says "done" but the docs it gates on are missing). Deriving from the actual records the pipeline reads means the gate is always in sync with reality. If a user deletes their profile doc, the gate re-engages — which is the correct behavior.

### 8.2 — Onboarding Wizard UI

**File:** `gtm-command-center/src/app/(app)/onboard/_components/onboard-client.tsx` (new)

4-step wizard. Each step saves via a server action on "Next" so partial progress is durable. Back navigation re-reads saved state.

**Step 1: About You** → writes `user_profile` + `user_positioning` memory docs

| Field                 | Type       | Maps to                                          |
| --------------------- | ---------- | ------------------------------------------------ |
| Positioning statement | Text input | "I'm a **_ who _**" — one line                   |
| Career highlights     | Textarea   | 3-5 bullets with metrics (reverse chronological) |
| Top proof points      | Textarea   | 3 hero accomplishments (used in email drafts)    |
| Technical tools       | Text input | Comma-separated tools/platforms                  |

Server action assembles these into structured markdown and upserts two `memory_documents` rows:

- `user_profile` (document_key) — career arc, tools, accomplishments
- `user_positioning` (document_key) — positioning statement, what makes them distinct

**Step 2: Search Preferences** → writes `pipeline_config` row

| Field            | Type                               | Maps to                            |
| ---------------- | ---------------------------------- | ---------------------------------- |
| Search queries   | Tag input (reuse Settings pattern) | `pipeline_config.search_queries`   |
| Search locations | Tag input (reuse Settings pattern) | `pipeline_config.search_locations` |
| Score threshold  | Number input (0-100, default 70)   | `pipeline_config.score_threshold`  |
| Daily send cap   | Number input (0-50, default 10)    | `pipeline_config.daily_send_cap`   |

Server action validates inputs (same rules as Settings `updateConfigAction`) and **upserts** the `pipeline_config` row on `(user_id)` via service client. Uses Supabase `.upsert(..., { onConflict: 'user_id' })` so the same action works for first-run insert, wizard resume, and Profile Refresh re-run. Matches the unique constraint on `pipeline_config(user_id)`.

**Step 3: Outreach & Preferences** → writes `user_dealbreakers` + `feedback_outreach_style` memory docs

| Field         | Type                             | Maps to                                    |
| ------------- | -------------------------------- | ------------------------------------------ |
| Green flags   | Textarea                         | What makes a company worth pursuing        |
| Red flags     | Textarea                         | Immediate disqualifiers                    |
| Outreach tone | Radio (casual / direct / formal) | How they write emails                      |
| What's worked | Textarea                         | Validated patterns, subject lines, framing |
| What to avoid | Textarea                         | Anti-patterns, things that bombed          |

Server action assembles structured markdown and upserts two `memory_documents` rows:

- `user_dealbreakers` (document_key)
- `feedback_outreach_style` (document_key)

**Step 4: Connect Gmail** → links to existing OAuth flow

- "Connect Gmail" button → `/api/auth/gmail` (existing OAuth start route)
- Show connected/disconnected status (check `gmail_credentials` for user)
- "Skip for now" option — Gmail is optional, pipeline can run without sending
- "Complete Setup" button → redirect to `/` (Today)

### 8.3 — Onboarding Server Actions

**File:** `gtm-command-center/src/app/(app)/onboard/actions.ts` (new)

```
saveProfileAction(data)       → upsert user_profile + user_positioning memory docs
saveSearchConfigAction(data)  → upsert pipeline_config on (user_id) unique constraint
saveOutreachAction(data)      → upsert user_dealbreakers + feedback_outreach_style memory docs
```

All actions:

- Authenticated via `requireUser()`
- Use service client for writes (consistent with Settings pattern)
- Upsert memory docs via `ON CONFLICT (user_id, document_key)` — safe for re-runs
- Validate inputs server-side before writing
- Set `origin: 'onboarding'` on memory docs (distinguishes from `'imported'` seed data)

### 8.4 — Context Layer Update

**File:** `gtm-command-center/src/lib/skills/context.ts` (modify)

Update `loadMemoryContext()` to check generic `user_profile` key first, then fall back to Omar-specific keys:

```typescript
// Before (Omar-specific)
profile: byKey("CLAUDE.md") || byKey("user_omar_profile"),

// After (onboarding-first, seed-compatible)
profile: byKey("user_profile") || byKey("CLAUDE.md") || byKey("user_omar_profile"),
```

Same for positioning:

```typescript
// Also check user_positioning (onboarding writes this)
positioning: byKey("user_positioning"),
```

This way:

- New users onboarded through the app → reads `user_profile`
- Omar's seeded data → falls back to `user_omar_profile`
- Both work, no migration needed

### 8.5 — Settings Integration

**File:** `gtm-command-center/src/app/(app)/settings/_components/settings-client.tsx` (modify)

- Add "Edit Profile" link/section at the top of Settings that navigates to `/onboard`
- Label it "Profile Refresh" — same wizard, but pre-filled with existing data
- This makes the flow replayable every few months as career context evolves

### 8.6 — Development & Testing

**Onboarding bypass (dev only):**

- Env var `DEV_SKIP_ONBOARDING=true` — skips the redirect gate in `page.tsx`
- Only active when `NODE_ENV === 'development'` (never in production)
- Lets developers work on Today/History/Settings without completing onboarding every time

**Step deep-linking:**

- Wizard supports `?step=N` URL parameter (e.g., `/onboard?step=3`)
- Useful for iterating on a specific step's UI without clicking through prior steps
- Works in all environments (not dev-only — also useful for Settings → Profile Refresh linking)

**Reset script:**

- `npm run onboard:reset` — deletes the current user's `pipeline_config` row and onboarding-origin `memory_documents` rows
- Uses the service client + a hard-coded dev user ID (or reads from `.env.local`)
- Only for local development — not exposed via UI or API

**Fixture fill states:**

- `npm run onboard:fixture -- --state=partial` — creates Step 1 docs only (wizard resumes at Step 2)
- `npm run onboard:fixture -- --state=complete` — creates all docs + config (gate passes, Today loads)
- `npm run onboard:fixture -- --state=empty` — alias for `onboard:reset`
- Scripts live in `scripts/` alongside existing seed scripts

### Key Decisions

| Decision                                  | Rationale                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Form wizard, not conversational interview | Faster to complete, easier to resume, no AI API calls during setup                  |
| Per-step saves, not one big submit        | Partial progress is durable; user can come back and resume                          |
| 4 steps, not 8 fields                     | Groups related inputs; reduces perceived effort                                     |
| Gate on Today page only                   | Other pages are useful even without full onboarding                                 |
| Upsert memory docs, not insert            | Safe for re-runs and Profile Refresh flow                                           |
| No new migration                          | `memory_documents` and `pipeline_config` tables already exist with the right schema |
| `origin: 'onboarding'` tag                | Distinguishes user-entered data from imported seed data                             |
| Form wizard, not resume/LinkedIn import   | Deferred to Phase 9 — see below. Phase 8 ships the minimum viable intake path.      |

### Intentionally Deferred (not Phase 8)

These are real product improvements but out of scope for Phase 8. Phase 8 ships the minimum form-based intake. Richer extraction is a future phase:

- **Resume/LinkedIn upload + AI synthesis** — Upload a PDF or paste a LinkedIn URL, run Claude to extract career arc, proof points, and tools into structured profile fields. Natural Phase 9 extension: the form fields become pre-filled suggestions from the AI parse, user edits and confirms.
- **Conversational intake (career-coach style)** — An in-app chat that interviews the user and populates memory docs. Higher quality extraction for nuanced context (e.g., "what makes you different?"), but requires AI API calls during onboarding and is harder to make resumable.
- **Progressive enrichment** — After initial onboarding, use pipeline outcomes (which emails got replies, which scores were accurate) to refine profile context over time. The "compounding value" layer that makes the system get smarter, not just start smart.

### What This Unlocks

- **Self-serve setup**: New user signs up → onboards in 5 minutes → pipeline runs with personalized context on first trigger
- **Scoring accuracy**: Profile + dealbreakers give Claude actual signal to match against JDs
- **Email quality**: Proof points + outreach style produce drafts that sound like the user, not a template
- **Replayable refinement**: User can refresh their profile from Settings as their career evolves
- **Multi-user ready**: Removes the Omar-specific seed dependency; each user has their own context

### Verification

1. `npx tsc --noEmit` — must pass
2. `npm run lint` — must pass
3. `npm run build` — must pass
4. New user (no seed): sign up → redirected to `/onboard` → complete all 4 steps → redirected to Today → run pipeline → opportunities scored against profile → drafts reference proof points
5. Existing user (seeded): Today loads normally, no redirect
6. Partial onboarding: complete Step 1 only → refresh page → wizard resumes at Step 2 (Step 1 data pre-filled)
7. Profile Refresh: Settings → "Edit Profile" → wizard pre-filled with existing data → save → pipeline uses updated context on next run
8. Context layer: `loadMemoryContext()` returns onboarded user's profile (not empty string)

---

## Phase 9: Prompt De-Omarification + Structured Scoring Profile

**Goal:** Replace Omar/Inkeep-specific content in system prompts with parameterized sender identity, then add a structured scoring profile for deterministic ranking + user-configurable weights.

**Why this is critical:** Phase 8 shipped self-serve onboarding — new users can populate their profile, search preferences, outreach style, and connect Gmail. The data flows into scoring and drafting via `loadMemoryContext()`. But the **system prompt content** in 9 prompt files still hardcodes Omar/Inkeep identity (34 total references). A new user's profile data reaches Claude, but Claude is still instructed to "draft a cold email from Omar Nasser" and "weight recent Inkeep experience heavily." Additionally, scoring is entirely LLM-driven with no structured user preferences — the user's dealbreakers and green flags are embedded in prose memory docs, with no deterministic guardrails or user-configurable weights.

### Design Decisions

| Decision                                                        | Rationale                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System prompts become template functions (not static constants) | Identity references are woven throughout system-level instructions — injecting identity only via the user message doesn't work for email prompts where Claude follows system-level voice/framing instructions |
| New `user_scoring_profiles` table (not JSON on pipeline_config) | Different lifecycle, different data shape, cleaner schema. One row per user, `UNIQUE(user_id)`                                                                                                                |
| Normalization runs automatically after input changes            | Triggered after `saveProfileAction`, `saveSearchConfigAction`, `saveOutreachAction` (onboarding), and `updateConfigAction` (Settings). Fast in-process derivation, no API calls. Idempotent via upsert        |
| Email tactics are parameterized using `SenderIdentity` fields   | "{sender.recentCompany} to {Company}?" subject line pattern, not Omar-specific. When `recentCompany` is null, the template omits company-transition framing                                                   |
| No data migration needed for Omar's seeded data                 | The fallback chain in `context.ts` already handles legacy keys. When Omar runs Profile Refresh, onboarding creates `user_profile` and normalization generates his scoring profile                             |

### 9A — SenderIdentity Type + Context Layer

**Goal:** Define the shared identity contract all prompts will use.

**File:** `src/lib/skills/sender-identity.ts` (new)

```typescript
export interface SenderIdentity {
  // ── Required (always populated from onboarding or profiles table) ──
  firstName: string;          // from profiles.display_name, fallback "there"
  fullName: string;           // from profiles.display_name, fallback "the sender"
  positioning: string;        // from user_profile § Positioning
  tools: string[];            // from user_profile § Technical Tools, split on comma
  proofPoints: string[];      // from user_profile § Top Proof Points, split on newlines
  outreachTone: "casual" | "direct" | "formal"; // from feedback_outreach_style § Outreach Tone

  // ── Optional (heuristic-extracted from Career Highlights, may be null) ──
  recentCompany: string | null;           // first company name from career highlights line 1
  recentCompanyDescriptor: string | null; // parenthetical after company if present
  recentRole: string | null;              // verb phrase after company in highlights line 1
  domainInsiderClaim: string | null;      // derived only when recentCompany is present
  signOff: string;                        // firstName or "Best" if firstName is fallback
}

export function extractSenderIdentity(
  ctx: MemoryContext,
  displayName?: string | null,
): SenderIdentity { ... }
```

**Required vs optional contract:** Required fields always resolve from onboarding data or the profiles table — they never produce empty output. Optional fields are heuristic-extracted from Career Highlights text; when missing, the system prompt templates use conditional blocks that omit the section entirely rather than inserting empty strings.

**Extraction heuristics for optional fields:**

The Career Highlights field is free-text bullets (e.g., `"- Built Compass at Inkeep: 400K+ impressions"`). The extractor parses the first bullet to derive:

- `recentCompany`: regex for `at {Company}` or `{Company}:` pattern in bullet 1
- `recentCompanyDescriptor`: parenthetical following company name, e.g., "(enterprise AI startup, ~40 people)"
- `recentRole`: verb phrase before `at`, e.g., "Built Compass"
- `domainInsiderClaim`: only set when `recentCompany` is present — defaults to `"selling to the same buyer in the same market"` which the user can override via Profile Refresh

When heuristics fail (no `at {Company}` pattern found), all four optional fields are `null` and prompts fall back to generic framing.

**Prompt template fallback behavior:**

- `recentCompany === null` → omit company-transition subject line, use positioning-led opening instead
- `domainInsiderClaim === null` → omit domain insider framing, use proof-point-led framing
- `signOff` falls back to `firstName`, which falls back to `"Best"`

**File:** `src/lib/skills/context.ts` (modify)

- Add `displayName: string` to `MemoryContext`
- Load from `profiles.display_name` in the existing parallel query block (profiles table has `display_name` populated on auth signup via `handle_new_user()`)
- Update comment: "Load Omar's memory context" → "Load user's memory context"

### 9B — System Prompt Conversion (Critical Files)

**Goal:** Convert 5 critical prompt files from `export const FOO_SYSTEM = "..."` to `export function buildFooSystem(sender: SenderIdentity): string`.

**File:** `src/lib/skills/prompts/email-b2b-customer-support.ts`

- `EMAIL_B2B_CUSTOMER_SUPPORT_SYSTEM` → `buildEmailB2bCustomerSupportSystem(sender)`
- Substitutions: "Omar Nasser" → `sender.fullName`, "Inkeep" → `sender.recentCompany`, sign-off → `sender.firstName`, subject line pattern → `sender.recentCompany` (omit if null)

**File:** `src/lib/skills/prompts/email-head-of-growth.ts`

- `EMAIL_HEAD_OF_GROWTH_SYSTEM` → `buildEmailHeadOfGrowthSystem(sender)`
- Substitutions: same as above + tool stack bullets → `sender.tools.join(", ")`, personality descriptors → generic strategy guidance derived from profile

**File:** `src/lib/skills/prompts/full-analysis.ts`

- `FULL_ANALYSIS_SYSTEM` → `buildFullAnalysisSystem(sender)`
- Substitutions: "Omar Nasser" → `sender.fullName`, "Inkeep" → `sender.recentCompany ?? 'employer'`, "Omar's dealbreaker flags" → "the candidate's dealbreaker flags"
- Prompt builder label: "Omar's Memory Context" → "Candidate Memory Context"

**File:** `src/lib/skills/prompts/jd-fit-rubric.ts`

- `JD_FIT_RUBRIC_SYSTEM` → `buildJdFitRubricSystem(sender)`
- Substitutions: "Omar Nasser's resume" → `sender.fullName + "'s resume"`, "Omar values candor" → "Be candid about gaps", "Inkeep" → `sender.recentCompany`

**File:** `src/lib/skills/prompts/company-fit-analyzer.ts`

- `COMPANY_FIT_ANALYZER_SYSTEM` → `buildCompanyFitAnalyzerSystem(sender)`
- Substitutions: "Omar Nasser" → `sender.fullName`, "Omar's positioning" → "the candidate's positioning"

### 9C — System Prompt Conversion (Medium + Low Files)

**File:** `src/lib/skills/prompts/career-coach.ts`

- `CAREER_COACH_SYSTEM` → `buildCareerCoachSystem(sender)`
- JSON output `owner: "Omar" | "coach"` → `owner: "user" | "coach"`

**File:** `src/lib/skills/prompts/people-research.ts`

- `PEOPLE_RESEARCH_SYSTEM` → `buildPeopleResearchSystem(sender)`
- "Omar Nasser's outreach" → `sender.fullName + "'s outreach"`

**File:** `src/lib/skills/prompts/create-prompt.ts`

- `CREATE_PROMPT_SYSTEM` → `buildCreatePromptSystem(sender)`
- "for Omar Nasser" → `"for " + sender.fullName`

**File:** `src/lib/skills/prompts/create-skill.ts`

- `CREATE_SKILL_SYSTEM` → `buildCreateSkillSystem(sender)`
- Same pattern

### 9D — Consumer Site Updates

Every file importing a `*_SYSTEM` constant must call the new builder + `extractSenderIdentity`. All consumers already have `memoryCtx` or can load it.

**Pipeline consumers (already have userId + svc):**

1. `src/lib/pipeline/scoring.ts:62` — `system: FULL_ANALYSIS_SYSTEM` → `system: buildFullAnalysisSystem(sender)`, sender extracted from existing `memoryCtx`
2. `src/lib/pipeline/steps/draft.ts:123-125` — ternary between both email system builders, sender from existing `memoryCtx`
3. `src/lib/pipeline/people-search.ts` — needs `userId` + `svc` params added to `searchPeople()` to load memory context. Caller `steps/research.ts` already has both.

**Legacy job handlers:** 4. `src/lib/jobs/handlers/company-fit-analyzer.ts` — refactor to use `loadMemoryContext(job.user_id, svc)` instead of manual query 5. `src/lib/jobs/handlers/career-coach.ts` — same refactor

**Server action consumers:** 6. `src/app/(app)/outreach/actions.ts:58` — `ctx` already loaded, extract sender 7. `src/app/(app)/analysis/actions.ts:32` — `ctx` already loaded, extract sender 8. `src/app/(app)/workspace-tools/actions.ts:30,55` — add `loadMemoryContext` + extract sender

### 9E — Registry + Context Cleanup

**File:** `src/lib/skills/index.ts`

- Line 53: "Omar's Inkeep insider voice" → "Domain insider cold email to CEO/founder"
- Line 61: "outside Omar's insider market" → "Stage-matched builder framing for growth leaders"

**File:** `src/lib/skills/context.ts`

- Comments genericized (already partially done in Phase 8)
- Fallback `byKey("user_omar_profile")` kept for backward compat with deprecation comment

### 9F — Structured Scoring Profile (Database)

**File:** `supabase/migrations/20260408000001_user_scoring_profiles.sql` (new)

```sql
CREATE TABLE IF NOT EXISTS public.user_scoring_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Layer 1: Stable rubric (derived from onboarding)
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
```

Plus RLS (select own), updated_at trigger, service-role writes only.

**File:** `src/lib/supabase/types.ts` — Add `UserScoringProfileRow` interface.

### 9G — Scoring Profile Normalization

**File:** `src/lib/pipeline/scoring-profile.ts` (new)

`normalizeScoringProfile(svc, userId)`:

1. Loads memory context + pipeline config
2. Derives Layer 1 + Layer 2 fields using the rules below
3. Upserts `user_scoring_profiles` row — overwrites derived fields but preserves existing weight columns (uses partial update, not full row replace)

**Normalization rules (explicit parsing contract):**

| Field                  | Source                                             | Parsing rule                                                                                                                                                                                                             | Fallback |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `role_fit_keywords`    | `pipeline_config.search_queries`                   | Direct copy, lowercased                                                                                                                                                                                                  | `[]`     |
| `seniority_years`      | `user_profile` § Career Highlights                 | Regex for year ranges (e.g., "2019-2024" → 5). Use earliest and latest years across all bullets.                                                                                                                         | `null`   |
| `preferred_stages`     | `user_dealbreakers` § Green Flags                  | Match against vocabulary: `pre-seed`, `seed`, `series-a`, `series-b`, `series-c`, `growth`, `enterprise`, `public`. Case-insensitive, match on substrings (e.g., "Series A-C" → `["series-a", "series-b", "series-c"]`). | `[]`     |
| `preferred_domains`    | `user_profile` § Positioning + § Career Highlights | Match against vocabulary: `saas`, `fintech`, `devtools`, `ai-ml`, `security`, `healthcare`, `ecommerce`, `edtech`, `martech`, `customer-ops`, `infra`, `data`. Case-insensitive substring match.                         | `[]`     |
| `tool_familiarity`     | `user_profile` § Technical Tools                   | Split on comma, trim, lowercase                                                                                                                                                                                          | `[]`     |
| `proof_points`         | `user_profile` § Top Proof Points                  | Split on newline/bullet markers (`\n-`, `\n*`, `\n1.`). Store as `[{ text: string }]`.                                                                                                                                   | `[]`     |
| `dealbreaker_patterns` | `user_dealbreakers` § Red Flags                    | Split on newline/bullet markers, trim, lowercase                                                                                                                                                                         | `[]`     |
| `target_roles`         | `pipeline_config.search_queries`                   | Direct copy                                                                                                                                                                                                              | `[]`     |
| `target_locations`     | `pipeline_config.search_locations`                 | Direct copy                                                                                                                                                                                                              | `[]`     |
| `green_flags`          | `user_dealbreakers` § Green Flags                  | Split on newline/bullet markers, trim                                                                                                                                                                                    | `[]`     |
| `red_flags`            | `user_dealbreakers` § Red Flags                    | Split on newline/bullet markers, trim                                                                                                                                                                                    | `[]`     |

Stage and domain vocabularies are defined as constant arrays in `scoring-profile.ts`. If a user's text matches none, the array stays empty — the scoring function treats empty arrays as "no preference" (dimension scored normally, not boosted/penalized).

**Normalization triggers** — `normalizeScoringProfile` must run anywhere its inputs change (all wrapped in try/catch — non-critical path):

| Trigger site                   | File                                | Why                                                         |
| ------------------------------ | ----------------------------------- | ----------------------------------------------------------- |
| After `saveProfileAction`      | `src/app/(app)/onboard/actions.ts`  | Profile/proof points/tools changed                          |
| After `saveSearchConfigAction` | `src/app/(app)/onboard/actions.ts`  | target_roles and target_locations come from pipeline_config |
| After `saveOutreachAction`     | `src/app/(app)/onboard/actions.ts`  | Green/red flags and dealbreaker patterns changed            |
| After `updateConfigAction`     | `src/app/(app)/settings/actions.ts` | Settings config changes affect target_roles/locations       |

`updateScoringWeightsAction` (9I) does NOT trigger normalization — it only updates weights, not derived fields. Normalization preserves existing weight values on upsert (only overwrites Layer 1 derived fields + Layer 2 preference lists, never weight columns).

### 9H — Scoring Function Enhancement

**File:** `src/lib/pipeline/scoring.ts` (modify)

1. Load scoring profile alongside memory context in `Promise.all` using `.maybeSingle()` — the row may not exist for older/seeded users
2. **Fallback when no `user_scoring_profiles` row exists:** all weights default to 1.0, all structured preference arrays treated as empty. Scoring proceeds identically to today's behavior — the weighting formula with all-1.0 weights produces the same result as the current fixed formula. This means normalization is opportunistic: it improves scoring when present but is never required for scoring to function.
3. When the profile row exists, inject structured preferences into prompt (target roles, green/red flags, preferred stages) so Claude has explicit signals. When it doesn't, omit the structured preferences section — Claude scores using memory context alone (current behavior).
4. After Claude returns dimension scores, apply Layer 2 weights:

```
For each JD Fit dimension (7): weighted_score = raw_score * dimension_weight
weightedJdRatio = sum(weighted_scores) / sum(max_per_dimension * weights)
Same for Strategic Fit (6 dimensions)
finalScore = (weightedJdRatio * 0.6 + weightedStrategicRatio * 0.4) * 100
```

Dimension weight mapping:

| Weight              | JD Fit Dimension       | Strategic Fit Dimension |
| ------------------- | ---------------------- | ----------------------- |
| weight_role_fit     | core_responsibilities  | —                       |
| weight_seniority    | years_seniority        | —                       |
| weight_stage        | —                      | stage_match             |
| weight_domain       | industry_domain        | market_familiarity      |
| weight_stack        | technical_requirements | —                       |
| weight_proof_points | outcome_evidence       | —                       |
| weight_dealbreaker  | gap_risk               | —                       |

### 9I — Settings UI for Weights

**File:** `src/app/(app)/settings/_components/settings-client.tsx` (modify) — Add "Scoring Profile" section (only renders if profile exists): read-only tags for derived Layer 1 values (tools, target roles, stages), sliders (0.5-2.0, step 0.1) for each Layer 2 weight, save via new `updateScoringWeightsAction`.

**File:** `src/app/(app)/settings/actions.ts` (modify) — Add `updateScoringWeightsAction` — validates weight ranges, updates `user_scoring_profiles`.

### Sequencing & PR Strategy

| PR   | Sub-phases             | Deps                     | Ships independently?                   |
| ---- | ---------------------- | ------------------------ | -------------------------------------- |
| PR 1 | 9A + 9B + 9C + 9D + 9E | None                     | Yes — complete prompt de-Omarification |
| PR 2 | 9F + 9G                | None (parallel with PR1) | Yes — database + normalization         |
| PR 3 | 9H                     | PR1 + PR2                | Yes — scoring enhancement              |
| PR 4 | 9I                     | PR2                      | Yes — Settings UI                      |

Implementation order within PR 1: 9A first (type + extractor), then 9B+9D together (prompts + consumers must ship atomically since export names change), then 9C (follows same pattern), then 9E (trivial cleanup).

### Verification

1. `npx tsc --noEmit` + `npm run lint` + `npm run build` after each sub-phase
2. **PR 1 static check:** Grep for "Omar" in `src/lib/skills/prompts/` — should find zero matches. Grep for "Inkeep" — zero matches. Also grep consumer files (`scoring.ts`, `draft.ts`, `outreach/actions.ts`, `analysis/actions.ts`, job handlers) for "Omar" and "Inkeep".
3. **PR 1 runtime check:** Add a test script `scripts/test-sender-identity.ts` that builds each converted system prompt from a synthetic `SenderIdentity` (`{ fullName: "Jane Doe", recentCompany: "Acme Corp", ... }`) and asserts: (a) output contains "Jane Doe" and "Acme Corp", (b) output does NOT contain "Omar" or "Inkeep", (c) output is non-empty and well-formed. Also test with all optional fields null to verify fallback branches produce coherent prompts without empty interpolations.
4. **PR 2 check:** Run `npm run onboard:fixture -- --state=complete`, verify `user_scoring_profiles` row is created with derived fields. Verify stage vocabulary matches (e.g., "Series A-C" → `["series-a", "series-b", "series-c"]`).
5. **PR 3 check:** Score an opportunity with non-default weights, verify normalized score differs from equal-weight calculation. Score with no `user_scoring_profiles` row — verify it succeeds with identical behavior to pre-Phase 9.
6. **PR 4 check:** Settings page renders weight sliders, saving updates the profile row. Verify CHECK constraint rejects weight outside 0.5-2.0.
7. **End-to-end:** New user signs up → onboards → scoring profile generated → pipeline runs → scores use structured profile + parameterized prompts → drafts use sender identity → no Omar/Inkeep references in output.

---

## Phase 10: Agentic Career-Coach Onboarding Interview

**Goal:** Replace the static 4-step form wizard with a conversational AI interview that feels like chatting with an expert career coach — one that proactively asks the best questions to truly understand the user, while simultaneously populating structured data in the DB for scoring, drafting, and sender identity.

**Why this matters:** The current onboarding produces shallow data. Users self-censor in forms, write what sounds professional, and skip nuance. A conversational interview extracts the specific stories, metrics, and preferences that make scoring accurate and outreach compelling — through dialogue, not self-reported labeled text boxes. The form wizard stays as a "skip to manual entry" escape hatch.

**Key constraint:** Phase 10 must produce _at minimum_ the same DB output as the current wizard — same `memory_documents`, same `pipeline_config`, same scoring profile normalization. Downstream consumers (scoring, drafting, sender-identity extraction) must not change. Additionally, the interview persists richer signal (full transcript + coach-derived insights) that the wizard never captured, for future use by downstream consumers.

### Design Decisions

| Decision                                                 | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Produce wizard-compatible output + richer insights layer | Downstream consumers (scoring, drafting) work unchanged on day one. The `interview_insights` memory doc captures nuance, stories, tradeoffs, and latent preferences that forms never collect — available for Phase 11+ consumers.                                                                                                                                                                                                                    |
| Server-side completion detection, not client-side        | If the client disconnects after the coach says "I have a solid picture," the server persists a `ready_for_extraction` flag. On resume, extraction auto-triggers. No stuck interviews.                                                                                                                                                                                                                                                                |
| Sequential confirmation with retry semantics             | `confirmInterviewAction` writes memory documents → pipeline_config → interview_insights → normalization → status update sequentially via service client. If any write fails, the interview stays in `review` and the user can retry. Partial writes are safe: each is an upsert on `(user_id, document_key)` / `(user_id)`, so retrying the full sequence is idempotent. A Postgres RPC transaction is not warranted for a one-time onboarding flow. |
| Structured topic tracking via tool calls                 | The coach uses an AI SDK tool (`report_topics`) to declare covered topics as structured data. No heuristic parsing of freeform assistant text. Progress dots are deterministic.                                                                                                                                                                                                                                                                      |
| All `onboarding_interviews` mutations via service client | Only a SELECT RLS policy exists on the table. All creates/updates happen in server actions and route handlers using `createSupabaseServiceClient()`, consistent with the app's write model.                                                                                                                                                                                                                                                          |
| Optimize for activation, not exhaustive coaching         | The interview goal is "first useful pipeline run" — enough signal to populate sender identity, search config, and scoring profile. Hard cap: 12 exchanges max, ~5 minutes. The coach wraps up once core outputs are populated, even if there's more to explore. Deeper Socratic coaching (career narrative, positioning refinement, interview prep) is explicitly deferred to a later recurring coaching surface, not crammed into onboarding.       |

### Low-Friction Onboarding Guardrails

The interview must balance depth with speed. Users are onboarding — they want to see the product work, not do a 30-minute intake.

**Stop condition:** The coach wraps up and emits `[INTERVIEW_COMPLETE]` when it has sufficient confidence to populate all core outputs:

- A positioning statement (not just a job title)
- At least 2 career highlights with specifics
- At least 2 proof points with metrics or outcomes
- At least 1 job title for search queries
- At least 1 location preference
- A sense of green/red flags (even broad ones)
- An outreach tone signal

**Hard limits:**

- Maximum 12 assistant messages. After message 10, the coach must begin wrapping up regardless of topic coverage.
- Maximum 1 follow-up probe per topic. If the user gives a vague answer and stays vague after one probe, accept it and move on.
- If the user signals impatience ("can we speed this up", short answers, "just get me started"), the coach condenses remaining topics into 1-2 rapid-fire questions and wraps up.

**What this means for data quality:** The onboarding interview produces "good enough" data to run the pipeline — not perfect data. Refinement happens through:

- Profile Refresh (re-enter the interview anytime from Settings)
- Phase 11: Outcome-Driven Refinement (approved/skipped signals tune the scoring profile over time)
- A future recurring coaching surface for deeper career narrative work

The system prompt enforces these guardrails explicitly.

### Data Flow

```
User ↔ Chat UI (streaming, useChat from @ai-sdk/react)
         │
         ▼
   /api/onboard/chat
   streamText(anthropic('claude-sonnet-4.5'))
   → tool: report_topics (structured topic state)
   → toUIMessageStreamResponse()
   onFinish:
     persist messages to onboarding_interviews.messages
     if [INTERVIEW_COMPLETE] in response → set ready_for_extraction = true
         │
         ▼
   Client detects ready_for_extraction (via refetch or onFinish)
   OR resume logic detects ready_for_extraction on re-entry
         │
         ▼
   extractAndReviewAction (server)
   → runClaudeJson (Opus) → extracted_* columns + interview_insights
   → status = 'review'
         │
         ▼
   ReviewClient (editable extracted data)
         │
   [Confirm & Continue]
         │
         ▼
   confirmInterviewAction (sequential idempotent writes)
   → upserts memory_documents (user_profile, user_positioning, user_dealbreakers, feedback_outreach_style)
   → upserts pipeline_config
   → persists interview_insights as memory_document
   → normalizeScoringProfile()
   → marks interview status = 'confirmed' (only if all above succeed)
   → on failure: stays in 'review', user retries (each write is an upsert, so safe to re-run)
         │
         ▼
   Gmail OAuth step (existing Step 4) → redirect to /
```

### Step 1 — Migration + Types

**New file:** `supabase/migrations/20260409000001_onboarding_interviews.sql`

```sql
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
```

Note: `extracting` status prevents race conditions if the user triggers extraction twice. `ready_for_extraction` flag enables server-side completion detection.

**Modified file:** `src/lib/supabase/types.ts` — Add `OnboardingInterviewRow` type matching the table, including `ready_for_extraction`, `extracted_insights`, and `'extracting'` in the status union.

### Step 2 — Install `@ai-sdk/react`

```bash
npm install @ai-sdk/react
```

The `ai` package (v6) and `@ai-sdk/anthropic` are already in `package.json`. `useChat` lives in `@ai-sdk/react`; `DefaultChatTransport`, `streamText`, `convertToModelMessages`, `tool` live in `ai`.

### Step 3 — Streaming Chat Endpoint

**New file:** `src/app/api/onboard/chat/route.ts`

- `POST` handler, authenticated via `requireUser()`
- Reads `{ messages, interviewId }` from request body
- Loads interview row from `onboarding_interviews` via **service client** (`createSupabaseServiceClient()`)
- If `is_refresh`, loads existing profile via `loadMemoryContext()` for system prompt context
- Defines a `report_topics` tool using AI SDK `tool()` with `inputSchema` for `{ covered: string[] }` — coach calls this to declare which topics are done
- Calls `streamText()` with `anthropic('claude-sonnet-4.5')`, system prompt from `buildInterviewPrompt(...)`, messages via `convertToModelMessages()`, tools
- Returns `result.toUIMessageStreamResponse()` with `onFinish` callback that:
  - Persists the full message array to `onboarding_interviews.messages` via service client
  - Reads `report_topics` tool results from the response to update `topics_covered`
  - Checks if `[INTERVIEW_COMPLETE]` marker is in the final assistant text — if so, sets `ready_for_extraction = true`
  - Uses `consumeStream` to ensure persistence survives client disconnect
- `maxDuration = 120`

Key pattern (mirrors existing `src/lib/ai/anthropic.ts` provider usage):

```typescript
import { streamText, convertToModelMessages, UIMessage, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
```

### Step 4 — Interview System Prompt + Tools

**New file:** `src/lib/onboarding/interview-prompt.ts`

Exports `buildInterviewPrompt(opts)` and `interviewTools`.

The prompt instructs the coach to call `report_topics` after each response to declare covered topics. This replaces freeform text parsing with structured tool output.

Four interview phases (~8-12 exchanges total):

1. **Identity & Positioning (2-3 turns)** — "What do you do? Give me the version you'd use with someone in tech but not your exact field."
2. **Career Story & Proof Points (2-3 turns)** — "Walk me through your last 2-3 roles — the real version, not the resume."
3. **Search Preferences & Dealbreakers (2-3 turns)** — "What does the ideal next role look like? What makes you instantly close a tab?"
4. **Outreach Style (1-2 turns)** — "When you reach out cold, what's your style?"

Prompt rules:

- One question at a time, under 100 words, mirror their vocabulary, no "phases/steps" language.
- Dig deeper on surface answers — but **maximum 1 follow-up probe per topic.** If they stay vague after one probe, accept it and move on. This is onboarding, not therapy.
- If the user signals impatience (short answers, "just get me started", redirecting), condense remaining topics into 1-2 rapid-fire questions and wrap up.
- **Hard cap: 12 assistant messages.** After message 10, begin wrapping up regardless of topic coverage. Some signal is better than an abandoned interview.
- Wrap-up condition: emit `[INTERVIEW_COMPLETE]` when you have enough to populate: a positioning statement, 2+ career highlights, 2+ proof points, 1+ job title, 1+ location, green/red flags, and an outreach tone signal. Don't hold out for perfection.
- Call `report_topics` after every response with the current list of covered topics.

Topic vocabulary for `report_topics`: `identity`, `career`, `proof_points`, `tools`, `search_prefs`, `dealbreakers`, `outreach_style`.

### Step 5 — Interview Server Actions

**New file:** `src/app/(app)/onboard/interview-actions.ts`

All mutations use `createSupabaseServiceClient()`. No client-side writes.

- `getOrCreateInterviewAction(isRefresh: boolean)` — finds `status IN ('in_progress', 'extracting', 'review')` row via service client or creates new one. Returns the row. If `ready_for_extraction` is true and status is still `in_progress`, auto-triggers extraction (handles the disconnect-resume case).

- `extractAndReviewAction(interviewId: string)` — sets `status = 'extracting'` first (prevents double-trigger). Loads messages from row. Calls `runClaudeJson` with Opus extraction prompt. Writes `extracted_profile`, `extracted_search`, `extracted_outreach`, and `extracted_insights` columns. Sets `status = 'review'`. On error, reverts status to `in_progress`.

- `confirmInterviewAction(interviewId: string, edits: { profile, search, outreach })` — **sequential idempotent writes** via service client: upserts memory documents (`user_profile`, `user_positioning`, `user_dealbreakers`, `feedback_outreach_style`) → upserts `pipeline_config` → persists `interview_insights` memory document → calls `normalizeScoringProfile()` → marks interview `status = 'confirmed'`. Each write is an upsert on `(user_id, document_key)` or `(user_id)`, so retrying the full sequence after a mid-sequence failure is safe. Interview stays in `review` until all writes succeed — the user can retry from the review screen.

- `abandonInterviewAction(interviewId: string)` — sets `status = 'abandoned'` via service client.

### Step 6 — Extraction Prompt + Logic

**New file:** `src/lib/onboarding/extraction-prompt.ts`

System prompt instructs Opus to produce JSON with two layers:

```typescript
{
  // Layer 1: Wizard-compatible fields (same shapes as existing save actions)
  profile: { positioning, careerHighlights, proofPoints, technicalTools },
  search: { searchQueries, searchLocations, scoreThreshold, dailySendCap },
  outreach: { greenFlags, redFlags, outreachTone, whatsWorked, whatToAvoid },

  // Layer 2: Richer interview insights (new — persisted as memory doc)
  insights: {
    career_narrative: string,        // 2-3 sentence synthesis of their career arc
    decision_drivers: string[],      // What actually motivates their job decisions
    unstated_preferences: string[],  // Preferences implied but not explicitly said
    strongest_stories: string[],     // The specific anecdotes that would land in emails
    positioning_alternatives: string[], // Other framings they could use
    risk_tolerance: string,          // How selective vs. open they are
    communication_style_notes: string  // How they naturally communicate (for outreach calibration)
  }
}
```

The `insights` layer captures exactly the kind of signal that forms never get — career narrative, decision drivers, unstated preferences, strongest stories. This is persisted as a `memory_document` with key `interview_insights` so future consumers (Phase 11 outcome-driven refinement, improved drafting, better scoring) can use it.

**New file:** `src/lib/onboarding/extraction.ts`

`runExtractionFromTranscript(messages: UIMessage[])` — formats messages into a transcript string, calls existing `runClaudeJson()` from `src/lib/ai/anthropic.ts` with Opus model, returns the structured extraction including insights.

### Step 7 — Chat UI

**New file:** `src/app/(app)/onboard/_components/interview-client.tsx`

Client component using `useChat` from `@ai-sdk/react`:

```typescript
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const { messages, sendMessage, status } = useChat({
  id: interviewId,
  initialMessages,
  transport: new DefaultChatTransport({
    api: "/api/onboard/chat",
    body: () => ({ interviewId }),
  }),
});
```

UI layout (uses existing design system tokens/classes):

- Messages in `.surface` cards — coach left-aligned, user right-aligned
- Coach messages get a small `Bot` icon (Lucide)
- Streaming indicator via CSS blinking cursor
- Topic progress dots at top derived from `topics_covered` (updated via structured `report_topics` tool calls, not text parsing)
- Input: `.input` class + `.btn-primary` send button
- "Skip to manual entry" as `.btn-ghost` link at bottom
- Auto-scroll via `useRef` + `scrollIntoView`
- AI speaks first: `initialMessages` includes opening question for new interviews
- On `ready_for_extraction` detected (via interview row refetch after each response), calls `extractAndReviewAction`
- Shows loading state during extraction ("Preparing your profile summary...")
- `report_topics` tool invocations are hidden from the message display (filtered from `message.parts`)

### Step 8 — Review UI

**New file:** `src/app/(app)/onboard/_components/review-client.tsx`

Three collapsible `.surface` sections showing extracted data with inline editing:

- **Profile:** positioning, career highlights, proof points, technical tools (same inputs as wizard Step 1)
- **Search:** queries (tag input), locations (tag input), score threshold, daily send cap (same as wizard Step 2)
- **Outreach:** green flags, red flags, tone selector, what's worked, what to avoid (same as wizard Step 3)

Additionally, a read-only "Coach Notes" section at the bottom shows `extracted_insights` — the richer signal the coach derived. Users can see what the system understood beyond the structured fields but don't need to edit it.

Actions: "Back to interview" link resumes chat (sets `status = 'in_progress'` and `ready_for_extraction = false` — clears the flag so the router doesn't auto-trigger extraction again; retains `extracted_*` columns so the old extraction is available if the user returns to review without continuing the conversation). "Confirm & Continue" calls `confirmInterviewAction` then renders Gmail step.

### Step 9 — Onboard Router + Page Modifications

**New file:** `src/app/(app)/onboard/_components/onboard-router.tsx`

Routing component:

- `interview.status === 'review'` → `ReviewClient`
- `interview.status === 'extracting'` → loading spinner ("Preparing your profile summary...")
- `interview.status === 'in_progress'` && `ready_for_extraction` → auto-trigger `extractAndReviewAction`
- `interview.status === 'in_progress'` → `InterviewClient`
- No interview + no user choice → choice screen
- User picks manual → `OnboardClient` (existing)

Choice screen: Two `.surface` cards — "Chat with an AI career coach (~5 min)" vs "Fill in the fields yourself (~3 min)".

**Modified file:** `src/app/(app)/onboard/page.tsx`

- Add fetch for active `onboarding_interviews` row (`status IN ('in_progress', 'extracting', 'review')`) via service client
- Render `OnboardRouter` instead of `OnboardClient` directly
- Pass both interview data and existing form prefill data as props

### Step 10 — Dev Tooling + Script Updates

**Modified file:** `scripts/onboard-reset.ts` — Add deletion of `onboarding_interviews` rows for the user (before existing deletions).

**Modified file:** `scripts/onboard-fixture.ts` — Add deletion of `onboarding_interviews` rows in `resetUser()`. Add `--interview-state` flag support:

- `--interview-state=transcript` — seeds an `in_progress` interview with a realistic multi-turn transcript fixture (covers all 4 topic phases, ~10 messages). Useful for testing extraction without running a real conversation.
- `--interview-state=review` — seeds a `review` interview with pre-populated `extracted_*` columns. Useful for testing the review UI and confirmation flow.
- `--interview-state=ready` — seeds an `in_progress` interview with `ready_for_extraction = true`. Useful for testing the resume → auto-extract flow.

**New file:** `scripts/test-extraction.ts` — Loads the transcript fixture, runs `runExtractionFromTranscript()`, prints the structured output, and asserts: (a) all required fields are non-empty, (b) `searchQueries` is a non-empty array, (c) `insights` object has all expected keys, (d) `outreachTone` is one of the valid enum values. Add `npm run test:extraction` script.

### Files Inventory

**New files (11):**

| File                                                           | Purpose                         |
| -------------------------------------------------------------- | ------------------------------- |
| `supabase/migrations/20260409000001_onboarding_interviews.sql` | Interview table                 |
| `src/app/api/onboard/chat/route.ts`                            | Streaming chat endpoint         |
| `src/lib/onboarding/interview-prompt.ts`                       | Coach system prompt + tool defs |
| `src/lib/onboarding/extraction-prompt.ts`                      | Extraction system prompt        |
| `src/lib/onboarding/extraction.ts`                             | Transcript → structured data    |
| `src/app/(app)/onboard/interview-actions.ts`                   | Interview lifecycle actions     |
| `src/app/(app)/onboard/_components/onboard-router.tsx`         | Mode switcher                   |
| `src/app/(app)/onboard/_components/interview-client.tsx`       | Chat UI                         |
| `src/app/(app)/onboard/_components/review-client.tsx`          | Review & confirm UI             |
| `scripts/test-extraction.ts`                                   | Extraction quality verification |

**Modified files (5):**

| File                             | Change                                                           |
| -------------------------------- | ---------------------------------------------------------------- |
| `src/app/(app)/onboard/page.tsx` | Add interview fetch, render OnboardRouter                        |
| `src/lib/supabase/types.ts`      | Add `OnboardingInterviewRow`                                     |
| `package.json`                   | Add `@ai-sdk/react`, `test:extraction` script                    |
| `scripts/onboard-reset.ts`       | Also delete `onboarding_interviews`                              |
| `scripts/onboard-fixture.ts`     | Also delete interviews in `resetUser()`, add `--interview-state` |

**Unchanged (explicitly preserving):**

| File                                                   | Why                                            |
| ------------------------------------------------------ | ---------------------------------------------- |
| `src/app/(app)/onboard/actions.ts`                     | Write logic reused by `confirmInterviewAction` |
| `src/app/(app)/onboard/_components/onboard-client.tsx` | Manual entry escape hatch                      |
| `src/lib/pipeline/onboarding.ts`                       | `isOnboardingComplete()` checks same 3 records |
| `src/lib/pipeline/scoring-profile.ts`                  | Triggered via confirmInterviewAction           |

### Verification

1. `npx tsc --noEmit` + `npm run lint` + `npm run build` — no type/lint/build errors
2. **New user flow:** choice screen → interview → streaming responses → `[INTERVIEW_COMPLETE]` → extraction → review → confirm → `isOnboardingComplete()` returns true → `interview_insights` memory doc exists
3. **Profile refresh:** Settings "Edit Profile" → `/onboard?mode=refresh` → interview with existing data context → confirm → data updated
4. **Resume (normal):** start interview → navigate away → return → conversation picks up from stored messages
5. **Resume (post-completion):** interview completes → client disconnects → user returns → `ready_for_extraction` detected → auto-extracts → review shown
6. **Retry safety:** simulate a partial write failure in `confirmInterviewAction` → verify interview stays in `review`, not `confirmed` → retry from review screen → all writes complete idempotently
7. **Manual entry:** choice screen → "manual" → existing wizard works unchanged
8. **Dev tooling:** `npm run onboard:fixture -- --interview-state=transcript` → `npm run test:extraction` → passes
9. **Reset:** `npm run onboard:reset` clears interview rows + all onboarding data
10. **Topic tracking:** verify `topics_covered` updates come from `report_topics` tool calls, not text parsing

### Intentionally Deferred (Phase 11: Outcome-Driven Refinement)

Update the scoring profile from user behavior:

- approved/skipped → weight adjustments
- sent/replied → validate scoring accuracy
- watchlist adds/removes → preference signals
- manual draft edits → outreach style refinement

This is the "compounding value" layer — shipped separately after Phase 10 proves the agentic interview works.

---

## Future: Exa Websets Job Discovery

The PRD mentions Exa Websets as a job discovery source alongside JSearch. This is deferred to post-v2:

- JSearch covers the core use case (structured job listings by query + location)
- Exa Websets job discovery would add continuous monitoring (webhooks) for new postings at specific companies
- Natural extension: watchlist companies auto-feed their job postings into the pipeline via Webset webhooks
- When implemented: add source='exa' to discovery step, generate external_id from Webset item ID

---

## File Summary

### New files (by phase)

| Phase | File                                                                      | Purpose                                               |
| ----- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1     | `gtm-command-center/supabase/migrations/YYYYMMDD_pipeline_v2.sql`         | New tables + security + ownership trigger             |
| 1     | `gtm-command-center/src/lib/pipeline/jsearch.ts`                          | JSearch API client (TS port)                          |
| 1     | `gtm-command-center/src/lib/pipeline/scoring.ts`                          | Extracted scoring function (pure, no JobRow)          |
| 1     | `gtm-command-center/src/lib/pipeline/people-search.ts`                    | Extracted research function (pure, no JobRow)         |
| 1     | `gtm-command-center/src/lib/pipeline/opportunities.ts`                    | Opportunity CRUD + claiming                           |
| 2     | `gtm-command-center/src/lib/pipeline/runner.ts`                           | Pipeline orchestrator                                 |
| 2     | `gtm-command-center/src/lib/pipeline/steps/discover.ts`                   | Step 1: Job discovery                                 |
| 2     | `gtm-command-center/src/lib/pipeline/steps/score.ts`                      | Step 2: Scoring + normalization                       |
| 2     | `gtm-command-center/src/lib/pipeline/steps/research.ts`                   | Step 3: People research (Websets)                     |
| 2     | `gtm-command-center/src/lib/pipeline/steps/enrich.ts`                     | Step 4: Email enrichment (with retry cutoff)          |
| 2     | `gtm-command-center/src/lib/pipeline/steps/draft.ts`                      | Step 5: Email drafting (with opportunity_id)          |
| 2     | `gtm-command-center/src/app/api/cron/pipeline/route.ts`                   | Daily cron endpoint                                   |
| 2     | `gtm-command-center/src/app/api/pipeline/run/route.ts`                    | Manual trigger endpoint                               |
| 3     | `gtm-command-center/src/app/(app)/_components/opportunity-card.tsx`       | Pipeline card component                               |
| 3     | `gtm-command-center/src/app/(app)/_components/email-variant-picker.tsx`   | Variant picker (uses opportunity_id FK)               |
| 3     | `gtm-command-center/src/app/(app)/history/page.tsx`                       | History view                                          |
| 4     | `gtm-command-center/src/app/api/auth/gmail/route.ts`                      | Gmail OAuth start (PKCE + user binding)               |
| 4     | `gtm-command-center/src/app/api/auth/gmail/callback/route.ts`             | Gmail OAuth callback (validated)                      |
| 4     | `gtm-command-center/src/lib/integrations/gmail.ts`                        | Gmail send + reply check + revoke                     |
| 4     | `gtm-command-center/src/app/api/cron/replies/route.ts`                    | Reply tracking cron                                   |
| 5     | `gtm-command-center/src/lib/pipeline/watchlist.ts`                        | Watchlist management                                  |
| 5     | `gtm-command-center/src/app/(app)/watchlist/page.tsx`                     | Watchlist view                                        |
| 6     | `gtm-command-center/src/app/(app)/settings/page.tsx`                      | Settings view                                         |
| 8     | `gtm-command-center/src/lib/pipeline/onboarding.ts`                       | Onboarding completion check                           |
| 8     | `gtm-command-center/src/app/(app)/onboard/page.tsx`                       | Onboarding wizard server component                    |
| 8     | `gtm-command-center/src/app/(app)/onboard/_components/onboard-client.tsx` | 4-step wizard client                                  |
| 8     | `gtm-command-center/src/app/(app)/onboard/actions.ts`                     | Onboarding server actions (profile, config, outreach) |

### Modified files

| File                                                                        | Change                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------- |
| `gtm-command-center/src/lib/supabase/types.ts`                              | Add new row types                               |
| `gtm-command-center/src/app/(app)/layout.tsx`                               | Replace sidebar nav                             |
| `gtm-command-center/src/app/(app)/page.tsx`                                 | Today view (replace redirect)                   |
| `gtm-command-center/vercel.json`                                            | Add cron config                                 |
| `gtm-command-center/package.json`                                           | Add googleapis dependency                       |
| `gtm-command-center/.env.example`                                           | Add new env vars                                |
| `gtm-command-center/src/lib/jobs/handlers/full-analysis.ts`                 | Refactor to call extracted `scoreOpportunity()` |
| `gtm-command-center/src/lib/jobs/handlers/people-research.ts`               | Refactor to call extracted `researchPeople()`   |
| `gtm-command-center/src/app/(app)/page.tsx`                                 | Add onboarding gate (redirect if not complete)  |
| `gtm-command-center/src/lib/skills/context.ts`                              | Add `user_profile` key fallback chain           |
| `gtm-command-center/src/app/(app)/settings/_components/settings-client.tsx` | Add "Profile Refresh" link to `/onboard`        |

### Deleted routes (Phase 3)

- `/analysis/job`, `/analysis/company`, `/analysis/new`
- `/research/new`
- `/outreach/new`
- `/coaching`, `/memory`, `/trail`, `/workspace-tools`

---

## Risks & Mitigations

| Risk                                              | Mitigation                                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Exa email enrichment low hit rate                 | Phase 0 spike; fallback to Apollo/Hunter                                                                              |
| Exa Websets people search doesn't return item IDs | Phase 0 spike; fallback to plain Exa search + manual enrichment                                                       |
| Pipeline timeout (300s) on large batches          | Per-stage batch limits: 10 discover, 5 score, 3 research, 5 draft                                                     |
| Gmail OAuth token expiry                          | Auto-refresh in `getGmailClient()`; re-encrypt and store updated token                                                |
| Duplicate opportunities                           | `external_id` NOT NULL + stable unique index + app-side 30-day check                                                  |
| Duplicate email sends                             | `sending` stage + `gmail_message_id` + `reserve_send_slot()` RPC with advisory lock (serializes concurrent approvals) |
| Overlapping pipeline runs                         | Row-level claiming via `processing_started_at` with 10-min stale recovery                                             |
| Infinite enrichment retries                       | `enrichment_attempts` counter with `max_enrichment_attempts` cutoff (default 3)                                       |
| Cross-table ownership bugs                        | DB trigger enforces matching user_id on all FK links + `opportunity_id` match on selected_draft_id                    |
| full-analysis cost per opportunity                | Rate limit: max 5 scorings per pipeline run; queue remainder                                                          |
| Prompt injection via external JD                  | Wrap external content in explicit delimiters; treat as data, not instructions                                         |
| Daily send volume abuse                           | Atomic cap reservation in single UPDATE (cap check + stage transition, no race window)                                |
| Cron secret missing from env                      | Fail-closed: return 500 if `CRON_SECRET` undefined, then compare (not `Bearer undefined`)                             |
| Settings bypass via direct DB update              | No client UPDATE RLS on pipeline_config; all updates via server actions                                               |
| EDT/EST cron drift                                | Cron at 10:00 UTC = 6am EDT / 5am EST. Acceptable 1-hour seasonal drift.                                              |
| Empty profile degrades pipeline quality           | Onboarding gate on Today page; pipeline won't surface opportunities until profile + config exist                      |
| Onboarding abandonment mid-wizard                 | Per-step saves; wizard resumes at first incomplete step on next visit                                                 |

---

## Verification Strategy

**Phase 0:** Run Exa Websets people search + enrichment spike on 10 companies. Measure email hit rate. Verify Webset items have stable IDs for enrichment.
**Phase 1:** Run migration on Supabase, verify tables + constraints + RLS policies + ownership trigger. Test: insert opportunity with mismatched analysis user_id → expect trigger error. Test: set selected_draft_id to a draft with wrong opportunity_id → expect trigger error. Test: INSERT new opportunity (not just UPDATE) with ownership trigger — verify TG_OP guard works. Seed config, call `searchJobs()` and verify structured output. Test extracted scoring function independently.
**Phase 2:** Trigger pipeline manually via API endpoint, verify opportunities advance through stages in Supabase. Test claiming: trigger two concurrent runs, verify no double-processing. Test error recovery: kill a run mid-pipeline, verify stale claims auto-release. Test enrichment retry cutoff: verify opportunity moves to needs_contact after max attempts.
**Phase 3:** Visual QA — cards render, expand, variant picker queries by opportunity_id. Approve/skip actions update stage in DB. Test concurrent approvals: two simultaneous approve calls with 1 cap slot remaining → only one succeeds (atomic cap reservation). Test: double-click approve → second call is no-op (stage precondition).
**Phase 4:** Send test email via Gmail API, verify `thread_id` + `message_id` stored, verify `sent_at` populated. Test reply detection with a real reply. Test daily send cap enforcement. Test OAuth flow: verify state JWT binds to authenticated user. Test disconnect: verify token revoked with Google.
**Phase 5:** Add company to watchlist, verify Exa Webset created. Re-ingest same alerts, verify dedup via `source_item_id` (NOT NULL constraint prevents NULL bypass). Test: insert alert without source_item_id → expect NOT NULL error.
**Phase 6:** Update settings via server action. Verify direct client UPDATE to pipeline_config is blocked by RLS. Verify validation rejects invalid input (threshold=101, 11 queries, 200-char query). Verify pipeline uses new config on next run.
**Phase 7:** End-to-end: trigger pipeline → opportunities appear in Today → approve one → email sends → verify in Gmail → reply → verify status updates to 'replied'.
**Phase 8:** New user (no seed): sign up → redirected to `/onboard` → complete all 4 steps → redirected to Today → run pipeline → opportunities scored against profile → drafts reference proof points. Existing seeded user: Today loads normally, no redirect. Partial onboarding: wizard resumes at first incomplete step. Profile Refresh from Settings: wizard pre-fills existing data, saves update, pipeline uses new context on next run. Verify `loadMemoryContext()` returns onboarded user's profile.
**Phase 11:** Complete onboarding → confirm → redirected to `/activate` → transition animation → JSearch discovers roles (10-day recency filter) → opportunities inserted and scored → up to 5 shown with scores and rationale (backfilled with "Close match" if fewer than 5 clear threshold) → Skip action works → "Run deeper search" triggers full pipeline → "Go to Dashboard" calls `dismissActivationAction()` then navigates to Today. Edge cases: JSearch returns 0 → empty state with Settings link, all escape buttons call `dismissActivationAction()` to prevent redirect trap. Scoring fails mid-batch → partial results shown from rank query across all recent scored opportunities. User refreshes during activation → rank step queries all recent scored opportunities (not just newly-inserted IDs), returning consistent results. Second visit to `/activate` after dismissal → redirects to Today.

---

## Phase 11: Post-Confirm Activation Search

**Goal:** Close the activation gap — immediately after onboarding confirm, run a fast discovery + scoring pass and show the user 5 high-signal opportunities before they ever see an empty dashboard. This is the first "magic moment."

**Why this matters:** After Phase 10, the onboarding interview deeply understands the user — their positioning, proof points, scoring preferences, dealbreakers. But the system then dumps them onto an empty Today dashboard with a "Run Pipeline Now" button. The gap between "I set up my profile" and "the system found opportunities for me" is where activation dies. Phase 11 makes the pipeline immediately prove its value.

**Key constraint:** The activation search is a _lightweight subset_ of the full daily pipeline. It runs discover → score only (no research, enrich, draft, queue). Purpose: show immediate value, not full pipeline coverage. The daily cron handles the complete flow later.

### Design Decisions

| Decision                                                    | Rationale                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Separate `/activate` route, not inline in ReviewClient      | ReviewClient is already complex (632 lines). A dedicated route handles refresh, browser back, and return-after-navigate cleanly. Server component fetches config; client component manages the search lifecycle.                                                                                                                                                               |
| Single long-running API route, not background job + polling | The activation search takes ~60–120s (20 discovers + 20 scorings). This is well within the 300s Vercel function timeout. A single `fetch()` call with a progress animation is simpler than introducing job queue + polling for a one-time operation.                                                                                                                           |
| Timed reassurance messages, not real-time streaming         | Real SSE progress adds complexity for marginal UX gain. Timed text rotations ("Searching job boards...", "Scoring matches...", "Almost done...") provide perceived responsiveness without backend changes.                                                                                                                                                                     |
| Extend `searchJobs()` with options, not a new function      | Adding optional `numPages` and `datePosted` params to `searchJobs()` is backward-compatible (defaults to current behavior) and avoids duplicating the query×location iteration + dedup logic.                                                                                                                                                                                  |
| `datePosted: "month"` + client-side 10-day post-filter      | JSearch API has no exact "10 days" option (only `"3days"`, `"week"`, `"month"`). Use `"month"` to get a superset, then post-filter by `job_posted_at_datetime_utc >= now - 10 days`. This satisfies the 10-day recency requirement without missing roles at the 7–10 day boundary.                                                                                             |
| Score all 20 in the API route, not via `runScore()`         | `runScore()` reads from DB (`getOpportunitiesByStage`), uses claim/release, and caps at 5. Activation needs to score all 20 freshly-inserted opportunities in one pass. Calling `scoreOpportunity()` directly (the pure scoring function) avoids the batch cap and claim overhead.                                                                                             |
| Opportunities go into the same `opportunities` table        | No separate activation table. Discovered and scored opportunities appear on Today and in History immediately. Dedup via `(user_id, source, external_id)` prevents double-inserts if the user re-runs activation.                                                                                                                                                               |
| Gmail prompt shown below activation results                 | The Gmail step from ReviewClient moves to the bottom of the first-results screen. This way the user sees value before being asked to connect Gmail.                                                                                                                                                                                                                            |
| `pipeline_config.activation_completed_at` flag              | Prevents showing the activation screen on every visit. Set on any terminal user action: successful results shown, empty-state dismissed, error-state dismissed, or explicit "Go to Dashboard." This avoids the redirect trap where empty/error outcomes keep bouncing users back to `/activate`. Today page checks this to decide between activation redirect and normal view. |

### Data Flow

```
confirmInterviewAction() → { ok: true }
  ↓
ReviewClient: router.push("/activate")
  ↓
/activate server component:
  - requireUser()
  - Load pipeline_config (queries, locations, threshold)
  - Check activation_completed_at → if set, redirect to "/"
  - Render ActivationClient with config props
  ↓
ActivationClient mounts:
  - Show transition: "Got it. I'm pulling a first batch now."
  - Start timed reassurance rotation
  - fetch('/api/activation/search', { method: 'POST' })
  ↓
/api/activation/search route handler:
  1. requireUser()
  2. Load pipeline_config
  3. searchJobs(queries, locations, { numPages: 1, datePosted: "month" })
       → JSearchResult[] (deduped)
  4. Post-filter: keep only results with job_posted_at_datetime_utc >= now - 10 days
  5. Cap at 20 results via .slice(0, 20)
  6. For each result:
     a. createOpportunity(svc, userId, { source: "jsearch", ... })
          → OpportunityRow | null (null = dedup hit)
     b. If inserted:
        - scoreOpportunity(company, role, jd, userId, svc)
            → { normalizedScore, jdFit, strategicFit, analysisResult }
        - Insert analyses row
        - advanceStage(discovered → scored/filtered, { score, ... })
  7. Rank: query user's recent scored opportunities (discovered in last 10 days),
     sort by score DESC
  8. Take top 5 above score_threshold; if fewer than 5, backfill with
     highest-scored below-threshold results (labeled "Close match") up to 5 total
  9. For each: extract 1-line fit rationale from analysisResult.summary
  10. Set pipeline_config.activation_completed_at = now()
  11. Return { results: ActivationResult[], stats: { discovered, scored, filtered } }
  ↓
ActivationClient receives response:
  - Hide progress, show first-results screen
  - Up to 5 cards with: company + role, score badge, posted date, fit rationale
  - Per-card: Skip (advances to skipped), View Job (external link)
  - Results are implicitly saved — they're already scored opportunities in the DB
  - Bottom: Gmail prompt (if not connected) + "Run deeper search" + "Go to dashboard"
  - "Go to Dashboard" calls dismissActivationAction() which sets
    activation_completed_at before navigating — this is the escape hatch
    that prevents the /activate redirect trap on empty/error outcomes
```

### 11A — Extend `searchJobs()` with Options

**Goal:** Allow activation search to use tighter date and page limits without duplicating JSearch logic.

**File modified:** `src/lib/pipeline/jsearch.ts`

Add an optional `SearchJobsOptions` parameter to `searchJobs()`:

```typescript
interface SearchJobsOptions {
  numPages?: number; // default: 3 (current behavior)
  datePosted?: string; // default: "month" (current behavior)
}

export async function searchJobs(
  queries: string[],
  locations: string[],
  options: SearchJobsOptions = {},
): Promise<JSearchResult[]> {
  // ... existing logic, but pass options.numPages and options.datePosted
  // to fetchJSearch() instead of hardcoded values
}
```

**Backward compatibility:** All existing callers (`runDiscover`) pass no options, so behavior is unchanged. Activation calls `searchJobs(queries, locations, { numPages: 1, datePosted: "month" })` — uses `"month"` to get a 30-day superset, then post-filters to 10 days in the activation engine (11B).

**Verification:** `npx tsc --noEmit` passes. Existing discover step still produces same results (numPages=3, datePosted="month").

### 11B — Activation Search Engine

**Goal:** The core activation logic — discover, score, return top 5.

**File (new):** `src/lib/pipeline/activation.ts`

```typescript
export interface ActivationResult {
  id: string; // opportunity.id
  companyName: string;
  roleTitle: string;
  score: number;
  jobUrl: string | null;
  postedAt: string | null;
  fitRationale: string; // 1-line from analysisResult.summary
  isCloseMatch: boolean; // true if score < threshold (backfill)
}

export interface ActivationStats {
  discovered: number; // raw JSearch results
  inserted: number; // after dedup
  scored: number; // passed threshold
  filtered: number; // below threshold
  errors: number; // scoring failures
}

export interface ActivationSearchResult {
  results: ActivationResult[];
  stats: ActivationStats;
}

export async function runActivationSearch(
  svc: SupabaseClient,
  userId: string,
  config: PipelineConfigRow,
): Promise<ActivationSearchResult>;
```

**Internal logic:**

1. **Discover:** Call `searchJobs(config.search_queries, config.search_locations, { numPages: 1, datePosted: "month" })`. JSearch returns up to ~30 days of results.

2. **Post-filter (10-day recency):** Filter results to only those with `job_posted_at_datetime_utc >= now - 10 days`. JSearch has no exact 10-day API param (`"week"` = 7 days, `"month"` = 30 days), so we use `"month"` and post-filter client-side. Results without a posted date are included (benefit of the doubt). Cap at 20 via `.slice(0, 20)`.

3. **Insert:** For each filtered JSearch result, call `createOpportunity(svc, userId, { source: "jsearch", external_id: job.job_id, ... })`. Track which IDs were newly inserted vs dedup-skipped. Per-job try/catch — a single bad insert doesn't abort the batch (same pattern as `steps/discover.ts`).

4. **Score:** For each successfully inserted opportunity, call `scoreOpportunity(company, role, jd, userId, svc)` directly (not through `runScore()`). Per-opportunity try/catch with error count. On success:
   - Insert `analyses` row (same pattern as `processOneScore` in `steps/score.ts`).
   - Call `advanceStage(svc, opp.id, userId, "discovered", scored/filtered, { score, score_components, analysis_id })`.
   - Auto-watchlist if score >= 80 (reuse `addToWatchlist()`).

5. **Rank (retry-safe):** Query **all** of the user's recent opportunities discovered in the last 10 days that are in `scored` or `filtered` stage — NOT just newly-inserted IDs from this run. This makes retries and refreshes return consistent results even when dedup skips previously-inserted rows. Order by `score DESC`.

6. **Threshold + backfill:** Take up to 5 results above `score_threshold`. If fewer than 5 clear threshold, backfill with the highest-scored below-threshold results up to 5 total. Below-threshold backfill results are tagged with `isCloseMatch: true` so the UI can label them "Close match." If 0 total results exist (no opportunities at all), return an empty array.

7. **Rationale:** For each result, extract `result.summary` or `result.executive_summary` from the linked analysis row. If neither exists, fall back to a generic "Scored {score}/100" string.

8. **Flag:** Set `pipeline_config.activation_completed_at = new Date().toISOString()`.

**Why not reuse `runScore()` from `steps/score.ts`:** Three reasons:

- `runScore()` caps at `MAX_SCORES_PER_RUN = 5`. Activation needs to score all inserted opportunities.
- `runScore()` uses `getOpportunitiesByStage()` which includes stale-claim recovery logic — unnecessary for a fresh batch.
- `runScore()` uses `claimOpportunity()` / `releaseOpportunity()` — unnecessary since activation is the only writer for these rows.

The scoring logic itself (`scoreOpportunity()` → Claude + Exa → analysis insert → stage transition) is reused identically.

**Verification:** Call `runActivationSearch()` from a test script with a configured user. Verify: opportunities inserted, scores computed, analysis rows created, top 5 returned sorted by score.

### 11C — Database: `activation_completed_at` Column

**Goal:** Track whether the activation search has run, preventing re-display on subsequent visits.

**File (new):** `supabase/migrations/YYYYMMDD_activation_completed_at.sql`

```sql
ALTER TABLE public.pipeline_config
  ADD COLUMN IF NOT EXISTS activation_completed_at timestamptz;
```

**No RLS changes needed.** `pipeline_config` is already client-readable, service-writable.

**Type update:** Add `activation_completed_at: string | null` to `PipelineConfigRow` in `src/lib/supabase/types.ts`.

**Verification:** Run migration. Verify column exists, defaults to null.

### 11D — API Route: `/api/activation/search`

**Goal:** Authenticated endpoint that runs the activation search.

**File (new):** `src/app/api/activation/search/route.ts`

```typescript
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runActivationSearch } from "@/lib/pipeline/activation";
import type { PipelineConfigRow } from "@/lib/supabase/types";

export const maxDuration = 300;

export async function POST() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: config, error } = await svc
    .from("pipeline_config")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !config) {
    return NextResponse.json(
      { error: "Pipeline not configured" },
      { status: 400 },
    );
  }

  const result = await runActivationSearch(
    svc,
    user.id,
    config as PipelineConfigRow,
  );

  return NextResponse.json(result);
}
```

**Authentication:** Uses `requireUser()` (cookie-based), same as `/api/pipeline/run`. No `CRON_SECRET` — this is user-initiated, not cron.

**Idempotency:** If called twice, `createOpportunity()` dedup prevents double-inserts. The second call scores any remaining unscored opportunities. `activation_completed_at` is set on first success; the `/activate` page redirects to `/` on subsequent visits.

**Verification:** `curl -X POST /api/activation/search` with auth cookies. Verify response shape matches `ActivationSearchResult`.

### 11E — Activate Page (Server Component)

**Goal:** The dedicated activation route that shows results after onboarding.

**File (new):** `src/app/(app)/activate/page.tsx`

```typescript
export default async function ActivatePage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // If activation already completed, go to Today
  const { data: config } = await svc
    .from("pipeline_config")
    .select("activation_completed_at, search_queries, search_locations, score_threshold")
    .eq("user_id", user.id)
    .single();

  if (config?.activation_completed_at) {
    redirect("/");
  }

  // If no config exists, onboarding isn't done
  if (!config) {
    redirect("/onboard");
  }

  // Check Gmail connection status
  const { data: gmailCreds } = await svc
    .from("gmail_credentials")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <ActivationClient
      gmailConnected={!!gmailCreds}
    />
  );
}
```

**Route guards:**

- `activation_completed_at` set → redirect to `/` (Today)
- No `pipeline_config` → redirect to `/onboard` (incomplete)
- Otherwise → render activation UI

### 11F — Activation Client Component

**Goal:** The client component that runs the search and displays first results.

**File (new):** `src/app/(app)/activate/_components/activation-client.tsx`

**States:**

1. **Searching** — progress animation with timed reassurance messages
2. **Results** — first-results screen with top 5 jobs
3. **Empty** — no matches found, with guidance
4. **Error** — API call failed, with retry

**Searching state UI:**

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  [pulsing dot animation]                        │
│                                                 │
│  "Searching job boards..."                      │
│  ↓ (after 10s)                                  │
│  "Found some matches, scoring against           │
│   your profile..."                              │
│  ↓ (after 30s)                                  │
│  "Analyzing fit for each role..."               │
│  ↓ (after 60s)                                  │
│  "Almost done — comparing your best matches..." │
│                                                 │
└─────────────────────────────────────────────────┘
```

Timed messages use `useEffect` with a timer. The animation matches the design system: `text-[var(--color-text-muted)]` text with a `animate-pulse` dot using `bg-[var(--color-blue)]`.

**Results state UI:**

```
┌──────────────────────────────────────────────────────────┐
│ Your top matches                                         │
│ Found N roles, scored M — here are your best fits.       │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Acme Corp                                    [78]    │ │
│ │ GTM Engineer                                         │ │
│ │ Posted 3 days ago                                    │ │
│ │ "PLG motion + small team + data platform signal"     │ │
│ │                                                      │ │
│ │ [View Job ↗]           [Skip]                        │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ ... (4 more cards)                                   │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 📧 Gmail Integration                                 │ │
│ │ Connect your Gmail to send outreach directly.        │ │
│ │ [Connect Gmail]  [Skip for now]                      │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ [Run Deeper Search]                    [Go to Dashboard] │
└──────────────────────────────────────────────────────────┘
```

**Card component:** Uses the existing design system tokens:

- `.surface` container with `p-4`
- Company name: `text-sm font-semibold`
- Role title: `text-xs text-[var(--color-text-muted)]`
- Score: `text-lg font-bold` with `scoreColor()` helper (green ≥80, yellow ≥60, red <60) — same logic as `OpportunityCard`
- Posted date: `text-xs text-[var(--color-text-subtle)]`, formatted as relative time using `formatRelativeTime()` from `src/lib/utils.ts`
- Fit rationale: `text-xs text-[var(--color-text)]` italic
- Close match label: if `isCloseMatch`, show `badge badge-warning` with "Close match" next to the score. This appears when fewer than 5 jobs clear threshold and below-threshold results are backfilled to show 5.
- Actions: `btn-ghost` for Skip, link for "View Job"
- No "Save" button — results are implicitly saved as scored opportunities in the DB. Users only need to act to dismiss (Skip) or explore (View Job).

**Actions:**

- **Skip:** Calls `skipOpportunityAction(id)` from `src/app/(app)/actions.ts` (already exists). Removes card from list with animation.
- **View Job:** External link to `job_url` (same pattern as OpportunityCard)
- **Run Deeper Search:** Calls `dismissActivationAction()` (see below), then `triggerPipelineAction()` from `src/app/(app)/actions.ts`, then `router.push("/")`. Shows running state.
- **Go to Dashboard:** Calls `dismissActivationAction()`, then `router.push("/")`. This ensures the activation gate in Today page (11H) won't redirect back to `/activate`.

**`dismissActivationAction()` — new server action in `src/app/(app)/activate/actions.ts`:**

Sets `pipeline_config.activation_completed_at = now()` for the authenticated user. This is the single escape hatch that prevents the `/activate` ↔ `/` redirect trap. Every exit path from the activation screen (success, empty, error) calls this before navigating away.

```typescript
export async function dismissActivationAction(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  await svc
    .from("pipeline_config")
    .update({ activation_completed_at: new Date().toISOString() })
    .eq("user_id", user.id);
  return { ok: true };
}
```

**Gmail section:** Only shown if `gmailConnected === false`. Same UI as ReviewClient's Gmail step: "Connect Gmail" link to `/api/auth/gmail?return_to=/`, "Skip for now" dismisses the section.

**Empty state UI:**

```
┌──────────────────────────────────────────────────────┐
│ No matches in the last 10 days                        │
│                                                       │
│ We searched for your configured queries but           │
│ didn't find matching roles posted recently.           │
│                                                       │
│ Try:                                                  │
│ • Broadening your search queries in Settings          │
│ • Adding more locations                               │
│ • Running a deeper search (checks the full month)     │
│                                                       │
│ [Adjust Settings]                  [Run Deeper Search] │
│                                      [Go to Dashboard] │
└──────────────────────────────────────────────────────┘
```

All three buttons call `dismissActivationAction()` before their respective navigation to prevent redirect loops.

**Error state:** Shows error message + "Try Again" button that re-fetches. Also shows "Go to Dashboard" which calls `dismissActivationAction()` before navigating — the user should never be trapped on this screen.

### 11G — Modified Post-Confirm Navigation

**Goal:** Route users to `/activate` after onboarding confirm instead of the empty Today page.

**File modified:** `src/app/(app)/onboard/_components/review-client.tsx`

Change the `handleConfirm()` success path:

```typescript
// Current (line 210-214):
if (!gmailConnected && !isRefresh) {
  setShowGmail(true);
} else {
  router.push(isRefresh ? "/settings" : "/");
}

// New:
if (isRefresh) {
  router.push("/settings");
} else {
  router.push("/activate");
}
```

**Key change:** First-time users always go to `/activate` after confirm, regardless of Gmail connection status. The Gmail prompt is now part of the activation results screen (11F), not a separate step. Refresh-mode users still go to `/settings` (they already have opportunities).

**The `showGmail` state and Gmail-step JSX in ReviewClient can be removed** since it's now handled by the activation screen. This removes ~30 lines from ReviewClient.

**Verification:** Complete onboarding → confirm → verify redirect is `/activate`, not `/`.

### 11H — Today Page: Activation Redirect for New Users

**Goal:** If a first-time user somehow lands on `/` before activation, redirect them.

**File modified:** `src/app/(app)/page.tsx`

After the existing onboarding gate (lines 46-54), add an activation gate:

```typescript
// Existing: redirect to /onboard if not complete
if (!onboarding.complete) {
  redirect("/onboard");
}

// New: redirect to /activate if onboarding complete but activation not run
const { data: activationConfig } = await svc
  .from("pipeline_config")
  .select("activation_completed_at")
  .eq("user_id", user.id)
  .single();

if (!activationConfig?.activation_completed_at) {
  redirect("/activate");
}
```

This handles edge cases:

- User bookmarks `/` and visits before activation
- User hits browser back from activation
- App restarts mid-activation

Once `activation_completed_at` is set, this gate is a no-op and Today renders normally.

**Verification:** New user with completed onboarding but no activation → visits `/` → redirected to `/activate`. User with completed activation → Today loads normally.

### 11I — Cron Job Verification

**Goal:** Verify existing cron endpoints are properly configured for production.

**No code changes needed** — crons are already configured:

**`vercel.json` (existing, confirmed):**

```json
{
  "crons": [
    { "path": "/api/cron/pipeline", "schedule": "0 10 * * *" },
    { "path": "/api/cron/replies", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/watchlist", "schedule": "0 11 * * *" }
  ]
}
```

**Verification checklist:**

- [ ] `CRON_SECRET` is set in Vercel environment variables (all environments)
- [ ] Each cron route checks `CRON_SECRET` with fail-closed logic (already implemented)
- [ ] `maxDuration = 300` is set on pipeline cron route (already implemented)
- [ ] Pipeline cron iterates all `pipeline_config` rows (already implemented)
- [ ] Reply tracking cron handles token refresh errors gracefully (already implemented)

**`.env.example` already includes `CRON_SECRET`.** No changes needed.

### Implementation Order

| Step                       | Depends on | Files                             | Estimate  |
| -------------------------- | ---------- | --------------------------------- | --------- |
| 11C: Migration             | —          | 1 new migration, 1 type update    | 15 min    |
| 11A: Extend searchJobs     | —          | 1 modified                        | 15 min    |
| 11B: Activation engine     | 11A, 11C   | 1 new file                        | 1 hour    |
| 11D: API route             | 11B        | 1 new file                        | 20 min    |
| 11F: ActivationClient      | 11D        | 2 new files (component + actions) | 1.5 hours |
| 11E: Activate page         | 11F        | 1 new file                        | 20 min    |
| 11G: Post-confirm nav      | 11E        | 1 modified                        | 15 min    |
| 11H: Today activation gate | 11C        | 1 modified                        | 15 min    |
| 11I: Cron verification     | —          | 0 files (manual check)            | 10 min    |

**Total: ~4 hours implementation + testing**

### Files Summary

**New files (6):**

- `supabase/migrations/YYYYMMDD_activation_completed_at.sql`
- `src/lib/pipeline/activation.ts`
- `src/app/api/activation/search/route.ts`
- `src/app/(app)/activate/page.tsx`
- `src/app/(app)/activate/_components/activation-client.tsx`
- `src/app/(app)/activate/actions.ts` — `dismissActivationAction()`

**Modified files (4):**

- `src/lib/pipeline/jsearch.ts` — add options param to `searchJobs()`
- `src/lib/supabase/types.ts` — add `activation_completed_at` to `PipelineConfigRow`
- `src/app/(app)/onboard/_components/review-client.tsx` — change post-confirm navigation, remove Gmail step
- `src/app/(app)/page.tsx` — add activation redirect gate

### Edge Cases

| Scenario                                                         | Handling                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSearch returns 0 results                                        | `dismissActivationAction()` is called when user clicks any escape button ("Go to Dashboard", "Adjust Settings", "Run Deeper Search"). Empty state shown with guidance: broaden queries, add locations, run deeper search. User is never trapped.                                                                                                     |
| JSearch API error (rate limit, 500)                              | Catch in `runActivationSearch()`, return `{ results: [], stats: { discovered: 0, ... } }`. ActivationClient shows error state with "Try Again" + "Go to Dashboard" (calls `dismissActivationAction()` before navigating).                                                                                                                            |
| Scoring fails for some opportunities                             | Per-opportunity try/catch. Partial results are shown. `stats.errors` tracks failures. Rank step still finds whatever was scored.                                                                                                                                                                                                                     |
| Scoring fails for ALL opportunities                              | `results` array is empty, `stats.errors > 0`. Show error state: "Scoring service unavailable — try again or run a deeper search later." "Go to Dashboard" calls `dismissActivationAction()`.                                                                                                                                                         |
| Only 1–4 jobs clear threshold                                    | Show those above threshold, then backfill with highest-scored below-threshold results (labeled "Close match" via `badge badge-warning`) up to 5 total. This avoids a weak first impression when decent jobs exist but fall just short.                                                                                                               |
| 0 jobs clear threshold but some exist                            | All results shown as "Close match" backfills (up to 5). User still sees value — the system found and scored roles, they just didn't score high enough.                                                                                                                                                                                               |
| User navigates away during activation search                     | API route continues running server-side. Opportunities are inserted + scored in DB. On next visit to `/`, activation gate checks `activation_completed_at`. If null, redirects to `/activate`. Rank step queries all recent scored opportunities (not just newly-inserted IDs), so previously-scored results appear on retry.                        |
| User refreshes `/activate` during search                         | Server component checks `activation_completed_at`. If null, renders ActivationClient which re-fires the search. Dedup skips already-inserted opportunities. Rank step queries all recent scored opportunities for this user (discovered in last 10 days), so results from the interrupted run are found and returned — not just newly-inserted rows. |
| User completes activation, then hits browser back to `/activate` | Server component sees `activation_completed_at` is set → redirects to `/`.                                                                                                                                                                                                                                                                           |
| Second user signs up concurrently                                | Each user has their own `pipeline_config` and `opportunities`. No cross-user state.                                                                                                                                                                                                                                                                  |
| `RAPIDAPI_KEY` not set                                           | `assertEnv("RAPIDAPI_KEY")` in `jsearch.ts` throws. Caught by activation engine, returned as error.                                                                                                                                                                                                                                                  |
| All search_queries or search_locations are empty                 | `searchJobs([], locations)` returns `[]`. Handled by empty state. Shouldn't happen post-onboarding (wizard enforces at least 1 of each).                                                                                                                                                                                                             |
| Activation takes >300s (hits Vercel timeout)                     | Unlikely for 20 jobs with `numPages: 1`. If it happens: partial results are in DB. On retry, rank step queries all recent scored opportunities, so partial results from the timed-out run are returned.                                                                                                                                              |
| User is on refresh mode (from Settings)                          | `isRefresh` → `router.push("/settings")` in ReviewClient. Activation is skipped. Refresh users already have opportunities.                                                                                                                                                                                                                           |
| Jobs exist but all posted >10 days ago                           | Post-filter removes them all. Same as 0 results — empty state with guidance to run a deeper search (which uses the full daily pipeline with `datePosted: "month"`).                                                                                                                                                                                  |

---

## Phase 12: Unified Opportunity Card

**Goal:** Unify the opportunity card component across Activate, Today, and History views so users see one consistent card format everywhere. The current state has two divergent card designs — the Activate flat card (View Job at top, rationale always visible, no accordion) and the Today/History accordion card (rationale hidden behind expand, View Job buried in expanded section). Phase 12 merges them into a single shared `OpportunityCard` that renders identically in all contexts.

**Why this matters:** After Phase 11, a user goes from the Activate screen (flat cards with rationale) to the Today dashboard (accordion cards with no rationale visible). Same data, different presentation. This breaks the principle that pipeline output should look the same regardless of which surface shows it.

**Key constraint:** The unified card must support all contexts: Activate (no drafts, no research, no approve/send), Today (full pipeline actions, draft picker, research links), and History (read-only, no actions). The card doesn't get simpler or more complex — it conditionally shows what's available.

### Design Decisions

| Decision                                                              | Rationale                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One `OpportunityCard` component, not two                              | Activate currently has inline card JSX in `activation-client.tsx`. Today/History use `opportunity-card.tsx`. Maintaining two card formats for the same data guarantees drift. One component with conditional sections is simpler long-term.                                                                                                                                                      |
| Rationale always visible, not behind accordion                        | The Phase 11 UX feedback was clear: the `bottom_line` fit rationale is the most valuable piece of information on the card. Hiding it behind an expand toggle forces an extra click on every card. Always-visible rationale matches the "status at a glance" design principle.                                                                                                                    |
| View Job link at top next to company name                             | Job posting is the primary reference point. Burying it in an expanded section means users can't quickly cross-reference the JD. Top placement (next to company name) matches the Activate layout that tested well.                                                                                                                                                                               |
| Accordion preserved only for drafts, research, analysis detail        | The expand toggle moves from "show any detail" to "show email drafts + deep-dive links." Scored/filtered cards with no drafts or research don't need an expand button at all — everything is visible. Cards with drafts/research show the chevron.                                                                                                                                               |
| `analysisSummary` loader fixed to use `bottom_line`                   | The Today page's `loadAnalysisSummaries()` currently reads `result.summary ?? result.executive_summary` — both are null in practice. The actual rationale lives in `result.bottom_line`. This is a bug that predates Phase 12; fixing it here ensures Today cards show the same rationale as Activate cards. The loader should also extract first two sentences (same logic as activation rank). |
| Activate client consumes `OpportunityCard` instead of inline JSX      | `ActivationClient` replaces its inline card markup with `<OpportunityCard>`. It passes the `ActivationResult` data mapped into an `OpportunityRow`-compatible shape, or we add an `activationResult` prop to the card.                                                                                                                                                                           |
| `job_posted_at` displayed when available, fallback to `discovered_at` | The unified card shows "Posted X ago" using `job_posted_at` (actual JSearch date) when present, falling back to `discovered_at`. This is already what Activate does; Today cards currently don't show posted date at all.                                                                                                                                                                        |
| History cards remain read-only                                        | `showActions={false}` already disables action buttons. No change needed for History — it gets the visual update for free.                                                                                                                                                                                                                                                                        |

### Current State Comparison

| Feature             | Activate (Phase 11)          | Today/History (Current)      | Unified (Phase 12)                              |
| ------------------- | ---------------------------- | ---------------------------- | ----------------------------------------------- |
| Company name        | Top left                     | Top left                     | Top left                                        |
| View Job link       | Top, next to company         | Hidden in expand             | Top, next to company                            |
| Stage badge         | Not shown                    | Shown                        | Shown                                           |
| Score               | Top right, colored           | Top right, colored           | Top right, colored                              |
| Role title          | Below company                | Below company                | Below company                                   |
| Posted date         | Shown (relative)             | Not shown                    | Shown (relative)                                |
| Recipient info      | Not shown                    | Shown if present             | Shown if present                                |
| Fit rationale       | Always visible (2 sentences) | Hidden in expand (full text) | Always visible (2 sentences)                    |
| "Close match" badge | Shown if below threshold     | Not applicable               | Shown if below threshold                        |
| Expand toggle       | None                         | Always present               | Only when drafts/research/analysis detail exist |
| Drafts              | Not applicable               | In expand section            | In expand section                               |
| Analysis link       | Not applicable               | In expand section            | In expand section                               |
| Research link       | Not applicable               | In expand section            | In expand section                               |
| Error display       | Not applicable               | In expand section            | In expand section                               |
| Skip/Flag actions   | Skip only                    | Skip + Flag                  | Skip + Flag                                     |
| Approve/Edit        | Not applicable               | On queued cards              | On queued cards                                 |

### 12A — Fix `loadAnalysisSummaries()` to Use `bottom_line`

**Goal:** Today page shows the same rationale as Activate.

**File modified:** `src/app/(app)/_loaders/today-queue.ts`

Change the summary extraction in `loadAnalysisSummaries()`:

```typescript
// Current (broken — both keys are null):
const summary =
  (result?.summary as string) ?? (result?.executive_summary as string) ?? "";

// New (matches activation rank logic):
const raw =
  (result?.bottom_line as string) ??
  (result?.summary as string) ??
  (result?.executive_summary as string) ??
  "";
if (raw) {
  const sentences = raw.match(/[^.!?]+[.!?]+/g) ?? [raw];
  const twoSentences = sentences.slice(0, 2).join(" ").trim();
  summaries[a.id] =
    twoSentences.length > 280
      ? twoSentences.slice(0, 277) + "..."
      : twoSentences;
}
```

**Verification:** Today page cards now show "Hard pass on this specific role. Retool is a great company, but..." instead of nothing.

### 12B — Add `job_posted_at` + `fitRationale` to OpportunityCard Props

**Goal:** Extend the card component to accept the new data it needs.

**File modified:** `src/app/(app)/_components/opportunity-card.tsx`

Add to `OpportunityCardProps`:

```typescript
interface OpportunityCardProps {
  opportunity: OpportunityRow;
  drafts: EmailDraftRow[];
  analysisSummary?: string; // existing — now always populated via bottom_line
  researchSummary?: string; // existing
  showActions?: boolean; // existing
  isCloseMatch?: boolean; // new — below threshold backfill flag
}
```

`job_posted_at` is already on `OpportunityRow` (added in Phase 11). `analysisSummary` is the 2-sentence rationale (now correctly populated by 12A). `isCloseMatch` is only set by Activate for backfill cards.

### 12C — Rewrite OpportunityCard Layout

**Goal:** Unified flat-first layout matching the Activate card design.

**File modified:** `src/app/(app)/_components/opportunity-card.tsx`

**New layout structure:**

```
┌──────────────────────────────────────────────────────────────┐
│ Row 1: [Company Name] [Stage Badge] [Close Match?] [View ↗] │ [Score]
│ Row 2: Role Title · Posted X ago                             │
│ Row 3: Recipient Name · Recipient Title (if present)         │
│ Row 4: "Hard pass. Retool is great but..."  (rationale)      │
│ Row 5: [Skip] [Flag] [Approve] [Edit & Approve]  (actions)  │
│ ─── expand divider (only if drafts/research/analysis) ───── │
│ Row 6+: Drafts picker, analysis link, research link, error   │
└──────────────────────────────────────────────────────────────┘
```

**Key changes from current OpportunityCard:**

1. **View Job link moves to Row 1** — inline with company name, before score. Currently in expanded section only.
2. **Posted date added to Row 2** — `formatRelativeTime(opportunity.job_posted_at ?? opportunity.discovered_at)`. Currently not shown.
3. **Rationale (analysisSummary) always visible in Row 4** — currently only in expanded section. Shown as `text-xs text-[var(--color-text-muted)] leading-relaxed`. Not italic (matches design system).
4. **Close match badge** — `badge badge-warning` shown next to stage badge when `isCloseMatch` is true.
5. **Expand chevron conditional** — only render the chevron button when the card has expandable content: `drafts.length > 0 || analysisSummary has a "View full analysis" link || researchSummary exists || opportunity.last_error`. Cards with nothing to expand show no chevron.
6. **Expanded section** — contains only: draft picker, analysis detail link ("View full analysis"), research detail link ("View full report"), error display. The analysis/research _summary text_ is NOT in the expanded section — it's in Row 4.
7. **Actions stay at Row 5** — same logic as current. Queued → Approve + Edit & Approve. Non-terminal → Skip + Flag.

**What does NOT change:**

- `scoreColor()` helper — identical
- `STAGE_CONFIG` — identical
- Action handlers (`handleApprove`, `handleSkip`, `handleFlag`, `handleEditAndApprove`) — identical
- `EmailVariantPicker` — identical, still in expanded section
- `showActions` prop behavior — identical

### 12D — Update ActivationClient to Use OpportunityCard

**Goal:** Remove inline card JSX from activation-client.tsx and use the shared component.

**File modified:** `src/app/(app)/activate/_components/activation-client.tsx`

The activation engine returns `ActivationResult[]` with `{ id, companyName, roleTitle, score, jobUrl, postedAt, fitRationale, isCloseMatch }`. The `OpportunityCard` expects `OpportunityRow`. Two approaches:

**Option A: Map ActivationResult to a partial OpportunityRow.**
Create a lightweight mapper that fills the required fields:

```typescript
function toOpportunityRow(r: ActivationResult): OpportunityRow {
  return {
    id: r.id,
    company_name: r.companyName,
    role_title: r.roleTitle,
    score: r.score,
    job_url: r.jobUrl,
    job_posted_at: r.postedAt,
    stage: r.isCloseMatch ? "filtered" : "scored",
    // ... remaining fields as defaults (null/empty)
  } as OpportunityRow;
}
```

Then render:

```tsx
<OpportunityCard
  opportunity={toOpportunityRow(r)}
  drafts={[]}
  analysisSummary={r.fitRationale}
  isCloseMatch={r.isCloseMatch}
/>
```

**Option B: Have the activation API return full OpportunityRow data.**
The rank query already fetches from the opportunities table. Return the full rows instead of a mapped subset. This avoids the mapper and ensures the card has all real data.

**Decision: Option B.** The rank query in `activation.ts` already reads from the `opportunities` table. Extend the select to `"*"` and return the full rows alongside the rationale. This means `ActivationResult` adds an `opportunity: OpportunityRow` field, and the client passes it directly to `OpportunityCard`. No mapper needed, no fake data.

**Changes to `activation.ts` rank query:**

- Select `"*"` instead of specific columns
- Return `opportunity` field on each `ActivationResult`

**Changes to `activation-client.tsx`:**

- Remove inline card markup (~40 lines)
- Import `OpportunityCard` from `../_components/opportunity-card`
- Map results to `<OpportunityCard opportunity={r.opportunity} drafts={[]} analysisSummary={r.fitRationale} isCloseMatch={r.isCloseMatch} />`

### 12E — Update History Client

**Goal:** History cards get the visual update for free — no code changes needed beyond what 12C provides.

**File:** `src/app/(app)/history/history-client.tsx` — no changes. Already passes `showActions={false}` and `OpportunityCard` renders the same layout.

**Verification:** History cards now show rationale + posted date without expand.

### Implementation Order

| Step                                | Depends on | Files                                                 | Estimate |
| ----------------------------------- | ---------- | ----------------------------------------------------- | -------- |
| 12A: Fix loadAnalysisSummaries      | —          | 1 modified (`_loaders/today-queue.ts`)                | 10 min   |
| 12B: Extend OpportunityCard props   | —          | 1 modified (`opportunity-card.tsx`)                   | 5 min    |
| 12C: Rewrite OpportunityCard layout | 12A, 12B   | 1 modified (`opportunity-card.tsx`)                   | 45 min   |
| 12D: Update ActivationClient        | 12C        | 2 modified (`activation.ts`, `activation-client.tsx`) | 30 min   |
| 12E: Verify History                 | 12C        | 0 files (visual QA only)                              | 5 min    |

**Total: ~1.5 hours implementation + testing**

### Files Summary

**Modified files (4):**

- `src/app/(app)/_loaders/today-queue.ts` — `loadAnalysisSummaries` uses `bottom_line` + 2-sentence extraction
- `src/app/(app)/_components/opportunity-card.tsx` — unified flat layout, conditional expand, new props
- `src/lib/pipeline/activation.ts` — rank query returns full `OpportunityRow`
- `src/app/(app)/activate/_components/activation-client.tsx` — uses shared `OpportunityCard`, removes inline card JSX

**No new files.**

### Edge Cases

| Scenario                                                           | Handling                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Card has no analysisSummary (unscored discovery)                   | Row 4 (rationale) simply not rendered. Card is shorter but structurally identical. |
| Card has no `job_posted_at` (legacy opportunities before Phase 11) | Falls back to `discovered_at` for "Posted X ago" display.                          |
| Card has drafts but no analysisSummary                             | Expand chevron shows for drafts. Rationale row absent.                             |
| Card has no drafts, no research, no error                          | No expand chevron rendered. Fully flat card.                                       |
| `isCloseMatch` on a non-activation card                            | Prop defaults to `false`. Badge not shown in Today/History.                        |
| History cards with `showActions={false}`                           | Action row not rendered. Same as current behavior.                                 |
| Very long rationale text                                           | Capped at 280 chars by the loader (12A). `line-clamp-3` as CSS safety net.         |

### Verification

**Phase 12:** Visual QA across all three surfaces: (1) Activate — cards use `OpportunityCard`, rationale visible, View Job at top, Skip works. (2) Today — cards show rationale from `bottom_line`, View Job at top, posted date visible, expand only for drafts/research, all actions work (approve, skip, flag). (3) History — read-only cards match Today layout, no actions, rationale visible. Cross-check: skip a card in Activate → verify it appears as skipped in Today/History.

---

## Phase 13: Safer Agentic Pursuit Rollout

**Goal:** Move the pursuit half of the pipeline toward a more adaptive, agent-assisted system without coupling runtime migration, business-logic changes, and observability into one risky rewrite.

**Why this matters:** The current `research → enrich → draft` path is too rigid, but the previous Phase 13 proposal tried to replace the orchestrator, pursuit strategy, tool surface, and UI visibility in one step. That is too much change at once. The safer path is:

1. make the runtime durable first
2. preserve current output semantics while doing so
3. add bounded decision-making second
4. add deeper tool-using autonomy only after the bounded layer is stable

### Managed Agents vs Workflow

The app now has enough context to make a more accurate tradeoff.

Claude Managed Agents is a **managed session-based agent harness**. Anthropic's docs describe four core concepts: **agent**, **environment**, **session**, and **events**. It is best suited to long-running asynchronous tasks where you want Anthropic-hosted execution, built-in tools like bash/files/web, and persistent event history across sessions.

That is a strong fit for some future research-heavy workflows, but it is **not** the safest first migration for this app's pipeline because:

- the current pipeline logic and Supabase writes already live inside the app codebase
- adopting Managed Agents would add a second execution boundary, plus agent/environment/session/event management
- internal DB mutations would need to be exposed through external tools or MCP surfaces
- Managed Agents is still beta and some advanced features are still preview-only

**Decision:** keep Managed Agents as a future option for richer external research or long-running off-platform exploration. For this phase, use **Vercel Workflow** first because it preserves direct access to existing server-side helpers and lets us migrate durability without rewriting the app's internal execution model.

### Architecture Overview

**Current pipeline:**

```
discover → score → research → enrich → draft → queued
```

**Safer staged target:**

```
Phase 13A: discover → score → research → enrich → draft → queued
           (same behavior, durable runtime)

Phase 13B: discover → score → pursuit planner → deterministic executor → queued / skipped / needs_contact

Phase 13C: discover → score → bounded pursuit agent → deterministic executor → terminal state

Phase 13D: add structured activity visibility for the new pursuit path
```

The important change is that **agentic decision-making arrives after runtime parity**, not before.

### Design Decisions

| Decision | Rationale |
| --- | --- |
| Split runtime migration from autonomy | If both change at once, failures become hard to diagnose. |
| Preserve existing pursuit behavior in 13A | This gives us a clean parity baseline before changing strategy. |
| Start with a bounded planner before a tool-using agent | A single structured decision is easier to verify than an open-ended loop. |
| Keep execution tools thin wrappers around existing helpers | Business logic should stay centralized in existing pipeline functions. |
| Require explicit terminal outcomes per pursued opportunity | Each run must end in `queued`, `skipped`, `needs_contact`, or a retry-safe stranded state. |
| Log structured decisions and tool events, not freeform reasoning | We want auditability without storing chain-of-thought-like text. |

### Cost and Budget Guardrails

Before 13B starts, the implementation must define and document a concrete per-run budget.

**Planner budget assumptions:**

- one planner call per pursued opportunity
- planner is only used for opportunities selected for pursuit, not every discovered row
- `MAX_PURSUITS_PER_RUN = 5`
- planner response must be structured and short; no long-form prose output

**Run-level budget guardrails:**

- max planner calls per run: `5`
- max draft-generation calls per pursued opportunity: `1`
- max people-search attempts per opportunity: `2`
- max enrichment attempts per selected contact: `1`
- max fallback target archetypes tried per opportunity: `3`

**Required implementation artifact:** before 13B is considered ready, add a short budget note to the plan or code comments with:

- model used for planner calls
- expected token range per planner call
- expected external API calls per opportunity in the happy path
- worst-case bounded external API calls per opportunity

The goal is not exact finance modeling up front. The goal is to make "bounded" operationally real before rollout.

### 13A — Durable Workflow Migration With Behavior Parity

**Goal:** Move the existing pipeline onto Vercel Workflow with minimal logic change.

**Scope:**

- Add Workflow runtime and wrap the current orchestrator in workflow steps.
- Keep `discover`, `score`, `research`, `enrich`, and `draft` behavior the same.
- Replace active polling loops with Workflow sleep/retry where possible.
- Keep existing stage transitions and DB writes unchanged.

**New file:** `src/lib/pipeline/workflow.ts`

**Files modified:**

- `src/app/api/cron/pipeline/route.ts`
- `src/app/api/pipeline/run/route.ts`
- `next.config.ts`

**Key design:** `workflow.ts` should call existing helpers in sequence. It is a durability migration, not a pursuit-logic rewrite.

**Feasibility checkpoint:** before estimating the full migration, validate the Workflow SDK surface against one small path:

1. install Workflow packages
2. wrap a trivial workflow or a single helper stage
3. confirm route invocation works
4. confirm retry / sleep semantics match what the current polling replacements need

If this checkpoint fails or exposes major SDK/runtime constraints, stop and revise before migrating all six pipeline stages.

**Pseudo-flow:**

```
loadConfig
runDiscover
runScore
runResearch
runEnrich
runDraft
recoverStranded
```

**Rules:**

- `runner.ts` stays in place until Workflow parity is proven.
- Cron and manual trigger can temporarily keep a fallback path to `runPipeline()`.
- Workflow migration is not complete until identical inputs produce materially identical stage outputs.
- Treat the original time estimate as optimistic until the feasibility checkpoint passes.

### 13B — Bounded Pursuit Planner

**Goal:** Add decision-making without introducing a full autonomous tool loop yet.

Instead of giving an agent direct access to all research and mutation tools, add a **single structured planning call** per scored opportunity. That planner decides:

- pursue mode: `deep` | `standard` | `light` | `skip`
- target contact archetype: `founder` | `hiring_manager` | `department_head` | `recruiter`
- fallback behavior if no contact is found
- whether the opportunity should go to `watchlist` instead of draft pursuit

**New file:** `src/lib/pipeline/pursuit/planner.ts`

**Inputs:**

- opportunity score and current analysis
- company size / context already available from scoring
- role seniority
- sender identity and user preferences

**Output:** strict structured JSON, not freeform text.

**Planner schema contract:**

```typescript
type PursuitPlan = {
  mode: "deep" | "standard" | "light" | "skip";
  target_contact: "founder" | "hiring_manager" | "department_head" | "recruiter";
  fallback_target_order: Array<
    "founder" | "hiring_manager" | "department_head" | "recruiter"
  >;
  watchlist_recommendation: boolean;
  skip_reason:
    | "low_signal_role"
    | "poor_fit"
    | "no_realistic_contact_path"
    | "company_red_flag"
    | null;
  confidence: "low" | "medium" | "high";
  rationale_summary: string; // <= 240 chars, for logs/UI only
};
```

**Mode guidance:**

- `deep`: high-conviction opportunity where deeper personalization effort is justified
- `standard`: normal pursuit path for a good role with a credible contact path
- `light`: pursue only if a contact is easy to identify and enrich; do not spend the full fallback budget
- `skip`: do not pursue outreach for this run

**Decision boundary guidance:**

- `light` is for borderline-but-viable opportunities where the system should make one efficient pass
- `skip` is for low-confidence or clearly poor pursuits where spending research/enrichment effort is not justified
- exact score thresholds should remain configurable in prompt logic, but the distinction between `light` and `skip` must be explicit in code comments and planner tests

**Prompt requirement:** implement the planner prompt and schema together. For a structured planner, the schema is the product contract, not an implementation detail.

**Execution boundary:** the planner does **not** write to Supabase and does **not** call external tools directly. It returns a plan that the deterministic executor follows.

**Why this is safer:** it lets us improve pursuit strategy while keeping side effects inside existing code paths.

### 13C — Deterministic Executor for Planned Pursuit

**Goal:** Execute the planner's recommendation using current pipeline helpers and explicit fallback rules.

**New file:** `src/lib/pipeline/pursuit/execute-plan.ts`

This executor:

- claims the opportunity
- runs existing research / people-search helpers with planner-selected targeting
- runs existing enrichment helpers
- creates drafts through the existing drafting path if a valid recipient exists
- transitions the opportunity to exactly one outcome:
  - `queued`
  - `needs_contact`
  - `skipped`

**Important:** `watchlist` remains additive behavior, not a replacement for terminal stage semantics. If the planner recommends watchlist, the executor must still write a clear opportunity outcome.

**Executor fallback chain:**

1. try the planner's `target_contact`
2. if no viable contact is found, try the ordered entries in `fallback_target_order`
3. stop after the bounded fallback limit, even if more archetypes exist
4. if a contact is found but no verified email is available, transition to `needs_contact`
5. if no credible contact is found after allowed fallbacks:
   - `light` mode should prefer `skipped` with structured reason
   - `standard` / `deep` mode may land in `needs_contact` if follow-up/manual review is justified
6. if the planner recommended `skip`, do not run research/enrichment helpers; write the skip outcome directly

**Deterministic fallback rules:**

- do not silently change target archetypes outside `fallback_target_order`
- do not loop indefinitely between target types
- do not create drafts without a verified recipient email
- do not let `watchlist_recommendation` suppress the final opportunity outcome
- every executor path must end in one of: `queued`, `needs_contact`, `skipped`

**Batch guardrails:**

- `MAX_PURSUITS_PER_RUN = 5`
- per-opportunity claim/release
- retry-safe handling for partially completed opportunities

### 13D — Optional Bounded Tool-Using Agent

**Goal:** Only after 13A-13C are stable, optionally introduce a small tool-using agent for the narrow cases where deterministic execution is insufficient.

This is where a DurableAgent may enter, but only with a constrained tool set:

- `searchPeople`
- `enrichEmail`
- `searchWeb`
- `skipOpportunity`

**Explicitly out of scope for the first cut:**

- arbitrary website scraping
- broad freeform web research
- direct draft creation from inside the agent
- freeform DB mutation tools
- multiple independent mutation tools with overlapping authority

**Why this is narrower:** the first agent should help choose and retry contact-finding strategy, not own the whole pursuit state machine.

### 13E — Structured Pursuit Activity Log

**Goal:** Add visibility once the new pursuit flow is behaviorally stable.

**Migration:** `supabase/migrations/YYYYMMDD_pursuit_activity.sql`

The table should store **structured audit data**, not raw agent reasoning:

```sql
CREATE TABLE IF NOT EXISTS public.pursuit_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  workflow_run_id text,
  phase text NOT NULL,                 -- "workflow" | "planner" | "agent"
  strategy text,                       -- "deep" | "standard" | "light" | "skip"
  outcome text,                        -- "queued" | "skipped" | "needs_contact" | "retry"
  contact_target text,                 -- "founder" | "hiring_manager" | etc
  contact_method text,                 -- "exa" | "web" | "manual" | null
  tool_events jsonb DEFAULT '[]',      -- structured event summaries
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**UI integration:** after the log proves useful, add a small "Pursuit log" detail view from the opportunity card. This is explicitly additive and should not block the workflow migration or planner rollout.

### Files Summary by Stage

**13A — Runtime parity**

- `next.config.ts`
- `src/lib/pipeline/workflow.ts`
- `src/app/api/cron/pipeline/route.ts`
- `src/app/api/pipeline/run/route.ts`

**13B-13C — Bounded decision + execution**

- `src/lib/pipeline/pursuit/planner.ts`
- `src/lib/pipeline/pursuit/execute-plan.ts`
- small changes to existing research/enrich/draft helpers only where targeting inputs must become more explicit

**13D — Optional bounded agent**

- `src/lib/pipeline/pursuit/agent.ts`
- `src/lib/pipeline/pursuit/tools.ts`

**13E — Observability**

- migration for `pursuit_activity`
- optional read path / UI surface later

### Implementation Order

| Step | Depends on | Files | Estimate |
| --- | --- | --- | --- |
| 13A0: Workflow feasibility checkpoint | — | package install + minimal route/workflow spike | 0.5-1 day |
| 13A1: Install Workflow and wrap existing pipeline | 13A0 | `package.json`, `next.config.ts`, workflow + route files | 0.5-1 day |
| 13A2: Replace active polling with workflow-safe waiting | 13A1 | workflow + helper touch points | 0.5 day |
| 13A3: Prove parity against current runner | 13A1 | no product changes | 0.5 day |
| 13B: Add structured pursuit planner | 13A3 | `planner.ts` + wiring | 1-2 hr |
| 13C: Add deterministic plan executor | 13B | `execute-plan.ts` + targeted helper updates | 2 hr |
| 13D: Optional bounded agent for hard cases | 13C | `agent.ts`, `tools.ts` | separate follow-up |
| 13E: Structured activity logging + UI | 13C or 13D | migration + additive UI | separate follow-up |

### What Changes

| Component | Before | After |
| --- | --- | --- |
| Pipeline runtime | Single function with timeout pressure | Durable workflow with resume/retry |
| Pursuit strategy | Mostly fixed path | Planner-guided path with explicit modes |
| Contact targeting | Implicit inside current research flow | Explicit structured target selection |
| Failure handling | Mixed polling / retries | Clear retry-safe workflow steps |
| Visibility | Stage changes only | Structured pursuit events later |

### What Does NOT Change in 13A

- JSearch discovery logic
- scoring prompt / scoring model behavior
- current DB tables and stage semantics
- Gmail sending and reply tracking
- onboarding and activation flows
- Today / History / Activate card UI

### Edge Cases

| Scenario | Handling |
| --- | --- |
| Workflow crashes mid-run | Resume from last completed step; do not restart completed steps |
| Cron overlap | Existing claim semantics still gate per-opportunity processing |
| Planner returns `skip` for high-score role | Allowed, but must write structured strategy + outcome |
| No contact found after deterministic pursuit | Transition to `needs_contact` or `skipped` based on explicit executor rule |
| Partial execution failure | Leave opportunity in a retry-safe state with enough metadata to avoid duplicate external work |
| Optional bounded agent exhausts tool budget | Return control to deterministic executor; do not leave open-ended loops |

### Verification

**13A — Runtime parity**

1. `npx workflow health`
2. Complete the Workflow feasibility checkpoint before full migration
3. Manual trigger on a controlled user with current pipeline behavior captured
4. Compare stage transitions and resulting queued opportunities between `runner.ts` and Workflow path
5. Force an interruption mid-run and verify Workflow resumes without duplicating completed work
6. Verify cron/manual trigger still work from the user's perspective

**13B-13C — Planner + deterministic executor**

1. Sample high-score startup role → planner selects founder/deep or equivalent explicit strategy
2. Sample mid-market role → planner selects hiring-manager/standard strategy
3. Borderline role → planner selects `light`, not `skip`, only when a one-pass pursuit is justified
4. No-contact scenario → deterministic executor lands in `needs_contact` or `skipped`, not limbo
5. Watchlist recommendation does not replace terminal opportunity state
6. Re-run same opportunity after partial failure → no duplicate drafts, no duplicate claim side effects
7. Budget guardrails enforced: no more than 5 planner calls per run and no more than the bounded fallback attempts per opportunity

**13D-13E — Optional later work**

- Validate bounded agent only expands hard-case success rate without regressing reliability
- Validate pursuit log is useful without exposing raw reasoning text

---

## Phase 14: Managed Agents Exploration (Draft Context Only)

**Status:** intentionally half-drafted. This section is for product and architecture direction, not near-term implementation.

**Goal:** Introduce Claude Managed Agents where autonomous long-running research can materially improve outcomes, without making Managed Agents the first owner of the core pipeline state machine.

### Why this was not Phase 13

Managed Agents are compelling, but they were intentionally deferred because the app is not yet at the right architectural boundary for them to own the primary pursuit loop.

The main reasons:

- the current pipeline still needs a durable in-app runtime baseline first
- internal opportunity state transitions need to stay deterministic and easy to audit
- exposing Supabase-backed writes to an off-platform agent too early would create a larger trust and idempotency surface
- Managed Agents introduces a second execution model:
  - agent definitions
  - environments
  - sessions
  - event streaming / retrieval
- Managed Agents is still beta, and some more advanced features are still preview-oriented

So the decision is not "no Managed Agents." The decision is "not before the app has a stable deterministic backbone."

### What Managed Agents are good for here

Managed Agents are most attractive for **long-running autonomous research missions** where the agent benefits from:

- managed infrastructure
- web access and built-in tools
- session persistence over time
- asynchronous execution
- richer exploration than a bounded planner should do

That makes them a better fit for **mission-style sidecar work** than for the first rewrite of the cron pipeline.

### Architectural Limits

If Managed Agents are added, they should initially sit **beside** the deterministic pipeline, not **underneath** it.

That means:

- the app creates a mission record
- the app starts or resumes a managed-agent session
- the managed agent performs research and produces a structured result artifact
- the app validates that artifact
- the app decides what gets written into core opportunity state

The managed agent should **not** initially have broad direct authority to:

- mutate arbitrary opportunity state
- advance stages without app-side validation
- write freeform data directly into core tables
- replace the entire discover/score/pursuit flow

This keeps the reliability boundary inside the app while still letting the agent do meaningful autonomous work.

### What must exist before Phase 14 starts

Managed Agents should come after the app has:

- a stable durable runtime for the main pipeline
- explicit terminal states for pursuit outcomes
- bounded planner / executor semantics for standard pursuit
- structured observability for pursuit decisions and outcomes
- a mission/result ingestion boundary so agent outputs can be validated before affecting user-facing state

In practice, that means **after Phase 13A and likely after 13B/13C**, not before.

### Likely first implementation shape

The first Managed Agents integration should be a **research mission lane**.

Suggested shape:

- new table or mission record for `managed_agent_missions`
- mission fields:
  - `opportunity_id`
  - `user_id`
  - `mission_type`
  - `status`
  - `session_id`
  - `result_json`
  - `created_at` / `updated_at`
- app-side mission launcher
- app-side result validator / importer

The result contract should be structured, for example:

- `recommended_contact`
- `contact_confidence`
- `company_brief`
- `supporting_sources`
- `suggested_pursuit_strategy`
- `recommended_next_action`

### Best first mission types

The strongest first candidates are:

- **Find the best contact**
  - for high-value roles where deterministic people-search failed or returned ambiguous candidates
- **Deep company brief**
  - gather relevant recent news, funding, team signals, and talking points with sources
- **Pursue-or-pass recommendation**
  - for borderline roles where deeper external context could change whether outreach is worthwhile
- **High-score escalation**
  - for a small number of top opportunities where more research depth is worth the cost

### Things we could do later if it works

If the first mission lane proves valuable and stable, Managed Agents could later support:

- autonomous re-research of stale high-priority opportunities
- multi-step contact-finding across company pages, news, and hiring context
- richer pre-draft outreach briefs for top opportunities
- user-invoked missions like:
  - "Research this company deeper"
  - "Find the best person to contact"
  - "Tell me whether this role is actually worth pursuing"

### Open questions for a real Phase 14 plan

Before this becomes an implementation phase, the plan should answer:

1. What exact mission types justify Managed Agents instead of the bounded planner/executor path?
2. What environment/tool configuration is required?
3. What structured artifact schema is imported back into the app?
4. What actions remain app-validated only?
5. What cost / timeout / concurrency budgets apply per mission?
6. What UX surfaces show mission progress and results?
7. What happens if a managed-agent session stalls, fails, or returns low-confidence output?

**Bottom line:** Managed Agents are a meaningful next-level capability for this app, but the right first role is as a **sidecar autonomous research system**, not as the initial owner of the primary pursuit pipeline.
