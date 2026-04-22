# ICP → Account Pipeline (TheirStack-primary, Exa-enrichment)

## Context

The ICP interview flow writes a structured rubric to `user_scoring_profiles.icp_rubric`, but today it has no downstream consumer. The pipeline still runs JSearch-for-jobs (`src/lib/pipeline/steps/discover.ts`) even for GTM users — the rubric is captured and then dead.

This plan makes the rubric drive the pipeline. A GTM user (profiles.user_type='gtm') completes ICP onboarding and the system returns a tiered, scored account list where each account is firmographically qualified **and** actively hiring a role from the rubric's `signals.hiring_roles`. That's what a sales rep can action on Monday.

**Why TheirStack as discoverer:** every `POST /v1/jobs/search` filter maps 1:1 to an ICP rubric field (industry, employee range, funding stage, geography, tech stack, hiring role, seniority). One API call returns firmographic-matched companies that are actively hiring, with the firmographic fields baked into the response (`company_domain`, `industry_id`, `employee_count`, `funding_stage`, `annual_revenue_usd`). No separate enrichment needed for firmographic signals.

**Why Exa in parallel (not replaced):** TheirStack gives us firmographic fields, not a research-grade company profile. The scoring prompt needs funding news, competitive context, leadership background to score strategic fit. `exaFindCompany()` already does this for job-seeker scoring (`src/lib/ai/exa.ts`) — reuse it per account.

**Credits economics:** TheirStack free tier is 50 company + 200 API credits/month, 1 credit per job returned. Narrow Series B queries return 20–60 jobs; a weekly sweep fits inside free tier for POC validation.

**Schema:** zero migrations. The `dual_persona_schema` migration (20260421200002) pre-allocated `opportunities.company_domain`, `trigger_signals`, `buyer_personas`, nullable `role_title`, and `profiles.user_type`. The `scoring_profile_icp` migration (20260421200003) added `user_scoring_profiles.icp_rubric`. Everything needed is live.

## Architecture

```
profiles.user_type
    ├─ 'job_seeker' → existing runner (JSearch → scoreOpportunity → …) [UNCHANGED]
    └─ 'gtm' → gtm-runner
                   ├─ Phase 2: runDiscoverAccounts (TheirStack)
                   │     → opportunities[source='theirstack']
                   ├─ Phase 3: runScoreAccounts (parallel exaFindCompany + generateObject)
                   │     → analyses[skill_slug='icp-account-fit']
                   │     → auto-watchlist at score >= 80
                   ├─ Phase 4: runDiscoverDormant (Exa Webset, no hiring requirement)
                   │     → opportunities[source='exa-dormant']
                   └─ Phase 5: /activate fast preview + TheirStack webhook inbound
```

Rubric flows: `icp_rubric` → `icpToTheirStackFilters(rubric)` → TheirStack payload → jobs → opportunities; and `icp_rubric` → `buildIcpAccountFitPrompt(rubric, theirstackFields, exaResearch)` → scorecard.

## Phased Plan

One working branch. One commit per phase per `feedback_refactor_granularity.md`. Regression gate per `feedback_refactor_regression_test.md`.

### Phase 0 — Regression gate (green on main before Phase 1 lands)

- New script: `scripts/test-pipeline-regression.ts` — seeds a job_seeker user with a `pipeline_config`, stubs the JSearch client to return 3 fixture jobs, runs `runPipeline`, asserts: opportunities inserted, analyses written, stages advanced, zero errors.
- New npm script: `test:pipeline-regression`.
- Commit: `phase-0: pipeline regression gate for job_seeker path`

### Phase 1 — Persona-routed pipeline spine

- Modify: `src/lib/pipeline/runner.ts` — at entry, read `profiles.user_type`. Branch to `runGtmPipeline(svc, userId)` or `runJobSeekerPipeline(svc, userId)` (rename of current runner body, no behavior change).
- New: `src/lib/pipeline/gtm-runner.ts` — stub that loads config + rubric, logs a structured no-op, returns a result matching the runner's existing shape.
- Verification: Phase 0 regression test still green. GTM test user runs produce a clean no-op run (no errors, no rows).
- Commit: `phase-1: persona-routed pipeline spine`

### Phase 2 — TheirStack discovery adapter

- New: `src/lib/integrations/theirstack.ts` — thin fetch-based client (pattern from `src/lib/ai/exa.ts`). Exports: `searchJobs(filters: TheirStackFilters): Promise<TheirStackJob[]>`. Bearer auth via `THEIRSTACK_API_KEY`. Zod schema for the response (`company_object` → `{ name, domain, linkedin_url, industry_id, employee_count, annual_revenue_usd, funding_stage, country_code }`). 400-line cap respected.
- New: `src/lib/pipeline/icp-to-theirstack-filters.ts` — pure function `icpToTheirStackFilters(rubric: IcpRubric): TheirStackFilters`. Always sets `posted_at_max_age_days: 30` (required by TheirStack API). Maps:
  - `firmographics.industries` → `industry_id_or` (needs a string→ID lookup; see Open Questions)
  - `firmographics.employee_range_min/max` → `min_employee_count`/`max_employee_count`
  - `firmographics.stages` → `funding_stage_or`
  - `firmographics.geographies` → `company_country_code_or`
  - `technographics.required_tools` → `company_keyword_slug_or`
  - `technographics.excluded_tools` → `company_keyword_slug_not`
  - `signals.hiring_roles` → `job_title_or`
- New: `src/lib/pipeline/steps/discover-accounts.ts` — `runDiscoverAccounts(svc, userId, rubric, runId?)`. Calls TheirStack, dedupes via existing `(user_id, source, external_id)` unique constraint with `source='theirstack'` and `external_id=job.id`. Uses existing `createOpportunity` in `src/lib/pipeline/opportunities.ts`. Writes: `company_name`, `company_domain`, `role_title=job.job_title`, `job_description=job.description`, `trigger_signals={ funding_stage, employee_count, industry_id, posted_at }`, `buyer_personas={ hiring_for: job.job_title, seniority: job.seniority }`.
- Modify: `src/lib/pipeline/gtm-runner.ts` — wire Phase 2 step.
- Modify: `.env.local.example` — add `THEIRSTACK_API_KEY`.
- Verification: seed GTM user with a confirmed rubric (`scripts/test-icp-confirm.ts` already seeds one). Trigger pipeline. Assert `select count(*) from opportunities where user_id=<id> and source='theirstack'` > 0 and `company_domain is not null` on every row.
- Commit: `phase-2: theirstack discovery adapter`

### Phase 3 — ICP account scoring (Exa enrichment in parallel)

- New: `src/lib/skills/prompts/icp-account-fit.ts` — builder functions `buildIcpAccountFitSystem(sender)` + `buildIcpAccountFitPrompt({ rubric, theirstackFields, exaResearch })`. Output shape: 6-dimension scorecard — `firmo_fit`, `techno_fit`, `hiring_signal_fit`, `buyer_fit`, `proof_point_relevance`, `disqualifier_risk` — each `{ score: 1-5, reasoning: string }`. Plus `verdict: 'Pursue' | 'Worth exploring' | 'Skip'`, `tier: 'A' | 'B' | 'C'`, `reason_to_believe: string` (one line for the AE).
- New: `src/lib/pipeline/scoring-account.ts` — `scoreAccountAgainstIcp({ opp, rubric, userId, svc, model? })`. Runs `exaFindCompany(companyName, companyDomain)` in parallel with prompt assembly. Uses `generateObject` + zod `icpAccountAnalysisSchema` per `CLAUDE.md` rule (schema as source of truth for stable-shape outputs). Model default: `claude-sonnet-4-6`.
- New: `src/lib/pipeline/steps/score-accounts.ts` — `runScoreAccounts(svc, userId, rubric, runId?)`. Mirrors `runScore` in `src/lib/pipeline/steps/score.ts`: claim → score → advance stage → release, batch of 10, per-opportunity error isolation. Writes `analyses` with `skill_slug='icp-account-fit'`, `role_title=NULL`. Advances `discovered → scored`. Auto-watchlist via existing `addToWatchlist(svc, userId, companyName, 'auto')` at normalized score >= 80.
- Modify: `src/lib/pipeline/gtm-runner.ts` — wire Phase 3 after Phase 2.
- Verification: same seed as Phase 2. After run: `select company_name, score, (result->>'tier') as tier, (result->>'reason_to_believe') as rtb from opportunities o join analyses a on a.id::text = o.analysis_id order by score desc limit 10`. Manually sanity-check top 3 against the rubric.
- Commit: `phase-3: icp account scoring with parallel exa enrichment`

### Phase 4 — Exa Webset dormant-ICP discovery (secondary lane)

- New: `src/lib/pipeline/icp-webset-query.ts` — builds Exa Webset query from rubric firmographics + technographics only (no hiring language). Output: query string + count.
- New: `src/lib/pipeline/steps/discover-dormant.ts` — `runDiscoverDormant(svc, userId, rubric)`. Creates/reuses Webset (lift `createWebset` pattern from `src/lib/pipeline/watchlist.ts` — may extract a shared helper). Inserts into opportunities with `source='exa-dormant'`, `role_title=NULL`, filtering out any `company_domain` already present as `source='theirstack'` for this user (Exa finds the long tail; TheirStack already has the hiring subset). Scores each with the Phase 3 scorer.
- New cron: `src/app/api/cron/dormant-discover/route.ts` — weekly sweep, `maxDuration=300`, bearer `CRON_SECRET` fail-closed (match existing cron security pattern in `src/app/api/cron/pipeline/route.ts`).
- Modify: `vercel.json` — add `/api/cron/dormant-discover` on `0 12 * * 1` (weekly Monday noon UTC).
- Verification: after a TheirStack run, trigger dormant cron manually. Assert opportunities gain `source='exa-dormant'` rows whose `company_domain` is disjoint from the TheirStack set.
- Commit: `phase-4: exa webset dormant-icp discovery`

### Phase 5a — GTM /activate fast preview

- New: `src/app/api/activation/accounts/route.ts` — POST, authenticated via `requireUser()`. Loads rubric, calls TheirStack with `posted_at_max_age_days: 30` and a tight filter set, caps results at 15, scores top 15 inline with `scoreAccountAgainstIcp` (Sonnet), returns sorted top 5. Mirrors the shape of `src/app/api/activation/search/route.ts`.
- Modify: `src/app/(app)/activate/_components/activation-client.tsx` — read `user_type` prop, call `/api/activation/accounts` when `gtm` else existing `/api/activation/search`. Persona-specific result renderer (`AccountResultCard` vs existing `OpportunityCard`).
- Verification: GTM user onboards through ICP confirm, lands on `/activate`, sees 5 Tier-A accounts with score + reason_to_believe in <30s.
- Commit: `phase-5a: gtm activation fast preview`

### Phase 5b — TheirStack webhook handler

- New: `src/app/api/webhooks/theirstack/route.ts` — POST. HMAC-SHA256 verify using `THEIRSTACK_WEBHOOK_SIGNING_SECRET`. Reject on bad signature. Idempotent insert (same `(user_id, 'theirstack', external_id)` dedup), immediate `scoreAccountAgainstIcp` on successful insert. Webhook `job.new` payload has the full job + company_object, same shape as `searchJobs` response (can share the zod schema).
- Modify: `.env.local.example` — add `THEIRSTACK_WEBHOOK_SIGNING_SECRET`.
- TheirStack dashboard setup (out-of-code): create a saved search keyed to user's rubric and point `job.new` at `https://<host>/api/webhooks/theirstack`. For a single-user app this is one-time manual; multi-user would need an automation pass later.
- Daily cron sweep from Phase 4 stays as the fallback for missed webhooks.
- Verification: use TheirStack "send test event" from the dashboard; verify signature passes, opportunity appears within seconds, scored and tiered.
- Commit: `phase-5b: theirstack webhook handler`

## Critical Files

**New**

- `scripts/test-pipeline-regression.ts`
- `src/lib/pipeline/gtm-runner.ts`
- `src/lib/integrations/theirstack.ts`
- `src/lib/pipeline/icp-to-theirstack-filters.ts`
- `src/lib/pipeline/steps/discover-accounts.ts`
- `src/lib/skills/prompts/icp-account-fit.ts`
- `src/lib/pipeline/scoring-account.ts`
- `src/lib/pipeline/steps/score-accounts.ts`
- `src/lib/pipeline/icp-webset-query.ts`
- `src/lib/pipeline/steps/discover-dormant.ts`
- `src/app/api/cron/dormant-discover/route.ts`
- `src/app/api/activation/accounts/route.ts`
- `src/app/api/webhooks/theirstack/route.ts`

**Modified**

- `src/lib/pipeline/runner.ts` — persona branch
- `src/app/(app)/activate/_components/activation-client.tsx` — persona branch
- `vercel.json` — dormant cron entry
- `.env.local.example` — `THEIRSTACK_API_KEY`, `THEIRSTACK_WEBHOOK_SIGNING_SECRET`
- `package.json` — `test:pipeline-regression` script

## Reused Existing Code

- `src/lib/ai/exa.ts` — `exaFindCompany` for per-account research in the scorer
- `src/lib/pipeline/opportunities.ts` — `createOpportunity`, `claimOpportunity`, `releaseOpportunity`, `advanceStage`, `getOpportunitiesByStage`
- `src/lib/pipeline/scoring.ts` — patterns only (generateObject + zod + model scope); do NOT modify `scoreOpportunity`
- `src/lib/pipeline/watchlist.ts` — `addToWatchlist` for auto-watchlist at score >= 80; `createWebset` pattern for Phase 4
- `src/lib/supabase/service.ts` — `createSupabaseServiceClient`
- `src/lib/supabase/auth.ts` — `requireUser`
- `src/lib/skills/sender-identity.ts` — `extractSenderIdentity` for prompt builder
- `user_scoring_profiles.icp_rubric`, `opportunities.company_domain|trigger_signals|buyer_personas`, nullable `opportunities.role_title`, `profiles.user_type`, `analyses.skill_slug` — all present, no migration

## End-to-End Verification Plan

Run at Phase 3 completion (main value-delivery milestone), then re-run at Phase 5b:

```bash
npm run onboard:fixture -- --state=complete --template=icp_definition --user-type=gtm
npm run pipeline:run
npm run test:pipeline-regression   # must stay green
```

Assertions:

1. `opportunities` table has `source='theirstack'` rows with non-null `company_domain`, `trigger_signals`, `buyer_personas`.
2. Every such row has an associated `analyses` row with `skill_slug='icp-account-fit'` and a valid 6-dimension scorecard passing the zod schema.
3. Top-3 Tier-A accounts pass a manual rubric sanity check.
4. Job-seeker regression test still green (Phase 0 guarantees this).
5. Watchlist has new rows for every account scoring >= 80.

At Phase 5a: `/activate` renders 5 scored accounts for a new GTM user in <30s.
At Phase 5b: TheirStack dashboard test webhook → opportunity in <10s, HMAC verified.

## Open Questions (resolve during execution, not blocking)

1. **Industry ID lookup.** TheirStack's `industry_id_or` uses LinkedIn Industry Codes V2 (numeric). Rubric industries are free text ("devtools", "B2B SaaS"). Options: (a) ship a static JSON map of the ~150 common industries; (b) call TheirStack's industry lookup endpoint once per pipeline run to resolve; (c) ship (a) first, fall back to (b) on miss. Pick during Phase 2.
2. **Tech stack slug translation.** `company_keyword_slug_or` uses TheirStack's internal slug vocab. Rubric `technographics.required_tools` is free text ("Salesforce", "HubSpot"). Same pattern: static map → API fallback.
3. **TheirStack POC rate limits.** 200 API credits/month free. Narrow Series B queries stay inside that envelope; broad queries blow through in a single run. Phase 2 log per-run credit spend to catch surprises; gate pipeline on `THEIRSTACK_DAILY_CREDIT_CAP` env var if we see drift.

## Out of Scope / Follow-Up Phases

- Contact enrichment (Apollo/Clay person search) gated on Tier A.
- GTM outbound drafter (positioning voice + email generator) — needs SPEC-4 positioning rubric template.
- CRM sync (Salesforce / HubSpot).
- Battlecards / persona cards / objection handlers generated from the rubric.
- Multi-user TheirStack webhook provisioning (per-user saved searches).
