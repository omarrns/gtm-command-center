# GTM Accounts — Contact Enrichment + Account Research

## Goal

Add Exa-backed account research and contact enrichment to the GTM lane so `/accounts` becomes actionable for selling. Reuse one shared `<ContactPanel>` so visual + behavioral upgrades land on both `/` (job_seeker) and `/accounts` (gtm) at once.

## Decisions (confirmed)

- **Targeting**: buyer persona + hiring-manager approximation. Source of truth for buyer personas is `user_scoring_profiles.icp_rubric` (NOT `pipeline_config` — that field doesn't exist there). Hiring manager is approximated from `opportunities.role_title`.
- **Contacts/account**: 1 primary + 1 alternate.
- **Trigger**: auto when normalized score ≥ `config.score_threshold` (NOT a hardcoded 70 — `score-accounts.ts:79` already drives this), plus a manual "Find contacts" button on `AccountCard` for re-runs / sub-threshold.
- **Account research**: new GTM-specific step (tech stack, recent funding/news, hiring trajectory, competitor mentions). Persisted in `research_reports` and referenced via `opportunities.research_id` (the existing slot used by job_seeker `research.ts`). Does NOT touch `analysis_id` — that belongs to ICP scoring and is already populated by `scoreOneAccount`.

## Architecture — three primitives + one orchestrator + one job + three call sites

The live GTM execution path does NOT go through `gtm-runner.ts` (that's reachable only from legacy `runner.ts`). The three sites that actually run GTM code in production are:

- `api/webhooks/theirstack/route.ts` (real-time `job.new`, calls `scoreOneAccount` inline)
- `api/cron/dormant-discover/route.ts` (weekly Exa sweep, scores per row)
- A new "Find contacts" button on the `/accounts` UI

### The orchestrator is async — runs inside a job, not inline

`processAccountAfterScore` cannot run inline at any of the call sites. Two hard timing facts:

- **Webhook** `maxDuration = 60s` (`api/webhooks/theirstack/route.ts:42`).
- **One Webset search alone** waits up to **180s** (`people-search.ts:325`, `waitUntilIdle` timeoutMs=180_000).

We need TWO Webset searches (primary + alternate) plus research plus two enrichments. That's ~240s minimum even fully parallelized — 4× the webhook budget. The dormant cron's 300s budget fits one row in the best case but it processes N rows, so inline is unsafe there too.

So the orchestrator lives inside a **single new background job type**, and every call site enqueues:

```
processAccountAfterScore(svc, userId, opportunityId, { skipThreshold? })
  ├─ researchOneGtmAccount(svc, userId, opportunityId)       (NEW)
  ├─ discoverContactsForAccount(svc, userId, opportunityId)  (NEW)
  └─ enrichContactsForAccount(svc, userId, opportunityId)    (NEW — refactor of enrich.ts)

  ↑ runs inside `gtm-find-contacts` job handler
```

- **Webhook**: `scoreOneAccount → enqueue gtm-find-contacts job` (gated on `score >= config.score_threshold`). Webhook returns 200 fast and stays well within its 60s budget.
- **Dormant cron**: after `runScoreAccounts` returns, iterate the new `scoredOpportunityIds` field and enqueue one job per ID. Keeps the cron's per-row cost cheap and lets contact-finding parallelize across the worker pool.
- **Manual button**: enqueue the same job with `skipThreshold=true`.

This is one job type, one handler, three callers. No duplicated orchestration logic. Webhook reliability is preserved.

### Pushback against Codex's earlier "real GTM workflow path" framing

This is NOT a Vercel Workflow durable run. Background-job persistence (`jobs` table + `claim_next_job` RPC) already gives at-least-once delivery + idempotent retries; webhook delivery is already durable via TheirStack at-least-once + the `(user_id, source, external_id)` dedup constraint. Adding `pipelineWorkflow`-style durability would be overkill.

Per-row idempotency comes from stage gates inside the primitives: `researchOneGtmAccount` only runs at `stage='scored'`, contact discovery only at `stage='researched'` with empty webset slots, enrich only at `stage='researched'` with unenriched contacts. Re-running the job on an already-`enriched` row is a no-op.

Job-level idempotency: the `jobs` table only has `payload jsonb`, no `target_id` column (`supabase/migrations/20260405000001_init.sql:78`), so the unique index must be an expression index on the payload field. The index is filtered to **`status='pending'` only**, NOT `IN ('pending', 'running')`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS jobs_gtm_find_contacts_pending_idx
  ON public.jobs (user_id, type, ((payload->>'opportunityId')))
  WHERE type = 'gtm-find-contacts'
    AND status = 'pending';
```

**Why pending-only**: the existing `claim_next_job` RPC has no stale-running recovery — a crashed worker leaves a row stuck at `status='running'` indefinitely. If the index covered `running`, that crashed row would block all future enqueues for the same opportunity, leaving the user with a permanently broken "Find contacts" button. By indexing only `pending`, the worst case is two concurrent jobs for the same opportunity, which is already safe because:

- `claimOpportunity` is atomic — only one of the two workers actually advances stage.
- Every primitive is stage-gated — the loser's calls become no-ops.
- The "stale running" row becomes harmless data; it doesn't block work.

Adding stale-running recovery to `claim_next_job` is a follow-up worth doing, but is out of scope for this PR.

## Phases

### Phase 0 — Extract `<ContactPanel>` (refactor only, no behavior change)

Extract the contact rendering block from `opportunity-card.tsx` into `src/components/contact-panel.tsx` taking a `Contact[]` prop:

```ts
interface Contact {
  role: "primary" | "alternate";
  name: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  pictureUrl: string | null;
}
```

`OpportunityCard` constructs `[{role:'primary', name: opp.recipient_name, ...}]` for now. Visual diff = zero. Verify by rendering Today and confirming pixel match.

### Phase 1 — DB migration

Created via `supabase migration new recipient_alternate_and_socials`. Pure additive ALTER (CLAUDE.md rule: never modify existing production columns), uses `IF NOT EXISTS` to match existing migration style:

```sql
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS recipient_linkedin_url      text,
  ADD COLUMN IF NOT EXISTS recipient_x_url             text,
  ADD COLUMN IF NOT EXISTS recipient_picture_url       text,
  ADD COLUMN IF NOT EXISTS alt_recipient_name          text,
  ADD COLUMN IF NOT EXISTS alt_recipient_title         text,
  ADD COLUMN IF NOT EXISTS alt_recipient_email         text,
  ADD COLUMN IF NOT EXISTS alt_recipient_linkedin_url  text,
  ADD COLUMN IF NOT EXISTS alt_recipient_x_url         text,
  ADD COLUMN IF NOT EXISTS alt_recipient_picture_url   text,
  ADD COLUMN IF NOT EXISTS alt_recipient_webset_id     text,
  ADD COLUMN IF NOT EXISTS alt_recipient_webset_item_id text,
  ADD COLUMN IF NOT EXISTS alt_enrichment_attempts     integer NOT NULL DEFAULT 0;
```

Update `src/lib/supabase/types.ts` `OpportunityRow` to mirror.

### Phase 2 — `researchOneGtmAccount` primitive

`src/lib/pipeline/steps/research-account.ts`:

- Signature: `researchOneGtmAccount(svc, userId, opportunityId)` — single-row, called per opportunity from the orchestrator. (Plural batch wrapper if/when needed.)
- Precondition: `stage='scored'`. No-op otherwise.
- Tools: Exa web search + Firecrawl on `company_domain`.
- Output schema (zod, strict):

```ts
const gtmAccountResearchSchema = z.object({
  techStack: z.object({
    current: z.array(z.string()),
    gaps: z.array(z.string()),
  }),
  recentFunding: z
    .object({
      stage: z.string(),
      amount_usd: z.number().nullable(),
      closed_at: z.string().nullable(),
      investors: z.array(z.string()),
    })
    .nullable(),
  recentNews: z.array(
    z.object({
      headline: z.string(),
      url: z.string().url(),
      published_at: z.string().nullable(),
      relevance: z.string(),
    }),
  ),
  hiringTrajectory: z.object({
    net_30d: z.number().nullable(),
    trend: z.enum(["accelerating", "steady", "slowing"]),
    signal_roles: z.array(z.string()),
  }),
  competitorMentions: z.array(
    z.object({
      competitor: z.string(),
      context: z.string(),
      source_url: z.string().url(),
    }),
  ),
});
```

- Persistence: insert into `research_reports`, set `opportunities.research_id` to the new row id. Existing slot, existing pattern (see job_seeker `research.ts`).
- Stage transition: `scored → researched`.
- Does NOT touch `analysis_id` — that's owned by `scoreOneAccount`.

### Phase 3 — `discoverContactsForAccount` primitive

`src/lib/pipeline/steps/discover-contacts-account.ts`:

- Signature: `discoverContactsForAccount(svc, userId, opportunityId)`.
- Precondition: `stage='researched'` and at least one of `recipient_webset_item_id` / `alt_recipient_webset_item_id` is null.
- Source for buyer-persona titles: `user_scoring_profiles.icp_rubric.buyer_personas` (already loaded by `gtm-runner.ts:33-37` — same query). NOT `pipeline_config.buyer_personas`.
- Builds two Exa Webset queries in parallel:
  1. **Primary** (buyer): titles from `icp_rubric.buyer_personas` filtered by `company_domain`.
  2. **Alternate** (hiring manager): titles inferred from `opportunities.role_title` (e.g. "Senior AI Engineer" → "Engineering Manager", "VP Engineering", "Head of Engineering").
- Reuse Webset machinery from `people-search.ts`. Extract a `runWebsetPersonSearch(svc, ctx, query)` primitive if the current shape is too tightly coupled to job_seeker's CEO+manager pair.
- Capture from each Webset item:
  - `recipient_name` ← `properties.person.name`
  - `recipient_title` ← `properties.person.position`
  - `recipient_linkedin_url` ← `properties.url` (Webset `url` is the LinkedIn profile)
  - `recipient_picture_url` ← `properties.person.pictureUrl`

  **`people-search.ts` does not currently extract `url` or `pictureUrl`** — Phase 3 must add this extraction.

- Stays at `stage='researched'` (handed off to enrich).

### Phase 4 — `enrichContactsForAccount` primitive (refactor of `enrich.ts`)

This is NOT a small extension. The current `enrich.ts:165-184` advances `researched → enriched` as soon as the primary email is found, after which the row exits the `stage='researched'` SELECT filter — so a naïve "also enrich the alternate" patch would orphan the alternate forever.

Real shape:

1. Select rows at `stage='researched'` where any contact slot is unenriched and not terminal.
2. For each row, iterate over both contacts:
   - Skip if email already filled.
   - Skip if attempts ≥ max_attempts (terminal).
   - Otherwise call `enrichViaWebset` and write the per-contact email + bump per-contact attempts.
3. After both contacts processed, make ONE stage decision:
   - any non-null email (primary OR alternate) → `enriched`
   - both contacts terminal-failed → `needs_contact`
   - otherwise stay at `researched` (will retry next run)

**Trade-off**: if primary email resolves on pass 1 and alternate is still under retry budget (e.g. transient error, attempts=1/3), the row advances to `enriched` and the alternate is dropped. This is intentional — `enriched` semantically means "usable for downstream outreach," and one good contact satisfies that. Keeping the row at `researched` to chase alternate would require a separate contact-completeness state (e.g. `contacts_complete` boolean), which is overscope for v1. Acceptable because a single deliverable contact is enough for outreach today.

X handle: optional second Exa enrichment query per person, gated behind `ENABLE_X_ENRICHMENT=true` env flag (cost control). Default off.

### Phase 5 — One job type, one handler, three enqueue sites

**New job type**: `gtm-find-contacts`. Job payload: `{ opportunityId, skipThreshold?: boolean }`.

**Handler** `src/lib/jobs/handlers/gtm-find-contacts.ts`:

```ts
export async function runGtmFindContactsJob(job, svc) {
  const { opportunityId, skipThreshold = false } = job.payload;
  return processAccountAfterScore(svc, job.user_id, opportunityId, {
    skipThreshold,
  });
}
```

**Two registry updates required** (missing either means the job never runs):

1. `src/lib/jobs/worker.ts:14` HANDLERS map gets `"gtm-find-contacts": runGtmFindContactsJob`.
2. `src/app/api/worker/claim/route.ts:4` `ALL_JOB_TYPES` array gets `"gtm-find-contacts"` so the default-polled worker actually claims it. Without this, the handler exists but is never invoked.

**Score-result extension required for the dormant cron path.** `runScoreAccounts` and `scoreOneAccount` currently return only counts / `{ newStage, normalizedScore }` — neither returns the opportunity ID of the row that just scored (`score-accounts.ts:141, 117`, `score.ts:26-36`). The dormant cron needs the IDs in order to enqueue per-row jobs without a fragile follow-up query. Two changes:

```ts
// src/lib/pipeline/steps/score.ts
export interface ScoreResult {
  processed: number;
  scored: number;
  filtered: number;
  errors: number;
  scoredOpportunityIds: string[]; // NEW — populated in the loop
}
```

`runScoreAccounts` (and `runScore` in the job_seeker lane, which shares the same type) push `opp.id` onto the array when `newStage === 'scored'`. Job_seeker doesn't read the field — purely additive. Webhook is unaffected; it already has the single row ID from the inline `scoreOneAccount` call.

**Initializer sweep required** — adding the field to the type breaks typecheck on every literal initializer. Eight sites need `scoredOpportunityIds: []` added:

- `src/lib/pipeline/steps/score.ts:140` (the actual `runScore` builder)
- `src/lib/pipeline/steps/score-accounts.ts:141` (the actual `runScoreAccounts` builder)
- `src/lib/pipeline/workflow.ts:264` (let-binding)
- `src/lib/pipeline/workflow.ts:348` (object literal in result)
- `src/lib/pipeline/runner.ts:102` (let-binding)
- `src/lib/pipeline/runner.ts:189` (object literal in result)
- `src/lib/pipeline/gtm-runner.ts:74` (let-binding)
- `src/lib/pipeline/gtm-runner.ts:112` (object literal in result)

No test fixtures use `ScoreResult` literals (verified via grep). All non-builder sites get `scoredOpportunityIds: []`.

**Webhook** (`api/webhooks/theirstack/route.ts`):
After the existing `scoreOneAccount(...)` call, if `normalizedScore >= config.score_threshold`, INSERT a `gtm-find-contacts` job with payload `{ opportunityId: created.id }`. Wrap in try/catch — webhook must always 200 to avoid TheirStack retry storms. The 60s budget stays comfortable because it's a single INSERT, not 240s of Webset waits.

**Dormant cron** (`api/cron/dormant-discover/route.ts`):
After `runScoreAccounts` returns, iterate `result.scoredOpportunityIds` and enqueue one job per ID. The cron stays fast (no inline contact-finding); the worker pool processes contact-finding in parallel.

**Manual server action** (Phase 6 below):
Inserts the same job with `skipThreshold: true`.

`gtm-runner.ts` is intentionally NOT modified. It's not on the live path.

### Phase 6 — Manual re-run server action

- `src/app/(app)/accounts/actions.ts` (new): `findContactsForAccountAction(opportunityId)` inserts a `gtm-find-contacts` job with `skipThreshold: true` and returns `{ jobId }`.
- Client polls via `useJobPoll(jobId)`, calls `router.refresh()` on completion.
- The handler from Phase 5 is shared — no separate manual-only code path.

### Phase 7 — UI: `AccountCard` renders `<ContactPanel>`

- `AccountCard` accepts new optional `contacts: Contact[]` prop.
- When non-empty, render `<ContactPanel>` below the metadata row.
- "Find contacts" button visibility — widened from the v1 plan because `contacts.length === 0` is too narrow:
  - Show button if `contacts.length === 0` AND `stage in ('scored', 'researched', 'needs_contact')`.
  - Show button if any contact has `email == null` AND `stage='needs_contact'` (terminal failure → user retry).
  - Hide button while a `find-contacts` job is in-flight for this opportunity (`useJobPoll` state).
- `accounts/page.tsx` already does `select("*")` (line 45). The work is the `OpportunityRow → AccountCardProps` projection: building `contacts: Contact[]` from the flat `recipient_*` + `alt_recipient_*` columns. Filter out contacts where `name == null`.

## Test plan

- `test:correctness` regression — assert score-≥-threshold rows advance through new stages on a fixture run.
- Unit test for buyer-persona title builder: given an `icp_rubric.buyer_personas` + `role_title`, asserts the right Webset query strings.
- Unit tests for the stage-decision logic in `enrichContactsForAccount`:
  - primary email found, alternate fails this pass (any state) → `enriched`
  - both contacts terminal-failed (attempts maxed, no email) → `needs_contact`
  - both contacts still under retry budget, no email yet → stays at `researched`
  - documents the v1 trade-off: alternate retry budget abandons when primary resolves first.
- Render check: `/accounts` renders `<ContactPanel>` with primary + alternate when populated; "Find contacts" button visibility under each of the three conditions above.
- Visual parity: snapshot `<ContactPanel>` from Today and Accounts to confirm shared component renders identically.

## Out of scope (this PR)

- Multi-thread (3–5 contacts).
- Auto-drafting outreach for GTM accounts (the `draft` step stays job_seeker-only).
- The `positioning_rubric` template is unrelated and stays untouched.
- Migrating `gtm-runner.ts` (legacy-adjacent; flagged for a follow-up cleanup PR but not load-bearing for this feature).
- **Stale-running job recovery** in `claim_next_job`. The pending-only unique index makes the manual button safe to retry, but crashed-worker rows accumulate indefinitely as `running`. Worth a follow-up to either time-out stale `running` rows or add a worker heartbeat. Not blocking for this feature.
- **Contact-completeness sub-state** ("kept chasing alternate after primary success"). Would require a new boolean column or a state between `enriched` and `needs_contact`. Documented as a trade-off in Phase 4.
