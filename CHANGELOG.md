# CHANGELOG — GTM Command Center

Build history extracted from CLAUDE.md. Not injected into AI context — reference only.

## Phase 0 — Integration Validation

- Exa Websets people search and enrichment drove the current pipeline design: research stores Webset person IDs, and enrichment runs against Webset enrichment endpoints.
- Gmail feasibility is reflected in the Phase 4 OAuth implementation using `gmail.send` and `gmail.metadata` scopes with PKCE and encrypted refresh-token storage.
- Throwaway spike artifacts are not part of the current product surface; treat the retained implementation files as the source of truth.

## Phase 1 — Schema, Config, and Security Foundation

- Pipeline tables and security foundation live in `supabase/migrations/20260407000001_pipeline_v2.sql`.
- Helper migrations:
  - `20260407000002_pipeline_v2_helpers.sql`
  - `20260407000003_atomic_claim_opportunity.sql`
  - `20260407000004_add_recipient_webset_id.sql`
  - `20260407000005_reserve_send_slot.sql`
- Core tables: `pipeline_config`, `gmail_credentials`, `opportunities`, `watchlist`, and `watchlist_alerts`.
- Important constraints and controls:
  - `opportunities.stage` is constrained to the pipeline stages from `discovered` through `replied`/`skipped`.
  - `opportunities` dedupes by `(user_id, source, external_id)`.
  - Cross-table ownership trigger validates linked analysis, research, and selected draft ownership.
  - `gmail_credentials` has no client RLS policies; access is service-role only.
  - Pipeline config is client-readable but updated through server-side actions.
- TypeScript row types are maintained in `src/lib/supabase/types.ts`.
- JSearch was ported to `src/lib/pipeline/jsearch.ts`.
- Opportunity helpers, atomic claiming, stale-claim recovery, and stage precondition transitions live in `src/lib/pipeline/opportunities.ts`.

## Phase 2 — Autonomous Pipeline

- Pipeline runner: `src/lib/pipeline/runner.ts`.
- Pipeline steps:
  - `steps/discover.ts`: JSearch discovery with insert cap and dedup.
  - `steps/score.ts`: full-analysis scoring, threshold routing, auto-watchlist at high score.
  - `steps/research.ts`: Exa Websets people search, stores `recipient_webset_id` and `recipient_webset_item_id`, routes missing contacts to `needs_contact`.
  - `steps/enrich.ts`: Exa Websets email enrichment, retry cutoff, cleanup, and `needs_contact` routing on terminal failure.
  - `steps/draft.ts`: CEO vs growth-leader prompt selection, exactly two variants, selected draft assignment, and `queued` transition.
- Cron endpoint: `src/app/api/cron/pipeline/route.ts`.
  - `GET`, bearer `CRON_SECRET`, fail-closed if missing/mismatched.
  - Iterates all `pipeline_config` rows.
  - `maxDuration = 300`.
- Manual trigger endpoint: `src/app/api/pipeline/run/route.ts`.
  - `POST`, authenticated with `requireUser()`.
  - Single-user scoped.
  - `maxDuration = 300`.
- Vercel cron:
  - `/api/cron/pipeline` at `0 4,16 * * *` (every 12 hours: 4am + 4pm UTC).

## Phase 3 — Today, History, and Settings UI

- Home route is `src/app/(app)/page.tsx`; root `src/app/page.tsx` was removed to avoid a duplicate `/` route.
- Today queue actions are in `src/app/(app)/actions.ts`:
  - `triggerPipelineAction()` calls `/api/pipeline/run` and forwards cookies.
  - `approveOpportunityAction()` reserves a send slot and sends through Gmail in Phase 4.
  - `skipOpportunityAction()` uses stage preconditions.
  - `flagCompanyAction()` validates watchlist upsert and skip transition results.
  - `updateSelectedDraftAction()` validates the draft belongs to the same user and opportunity.
- Shared Today UI components:
  - `src/app/(app)/_components/opportunity-card.tsx`
  - `src/app/(app)/_components/email-variant-picker.tsx`
  - `src/app/(app)/_components/today-client.tsx`
- History:
  - `src/app/(app)/history/page.tsx`
  - `src/app/(app)/history/history-client.tsx`
  - `src/app/(app)/history/actions.ts`
  - Supports status, company search, and min/max score filters.
  - History cards are read-only for draft variants.
- Settings:
  - `src/app/(app)/settings/page.tsx`
  - `src/app/(app)/settings/actions.ts`
  - `src/app/(app)/settings/_components/settings-client.tsx`
  - Handles pipeline configuration and Gmail connect/disconnect controls.
- Legacy v1 routes that are not part of v2 redirect instead of remaining active product surfaces.

## Phase 4 — Gmail Send and Reply Tracking

- OAuth routes:
  - `src/app/api/auth/gmail/route.ts`: starts Google OAuth with PKCE, signed state, nonce cookies, and `gmail.send`/`gmail.metadata` scopes.
  - `src/app/api/auth/gmail/callback/route.ts`: validates signed state, nonce, and user binding before token exchange.
- Gmail integration:
  - `src/lib/integrations/gmail.ts`: authenticated Gmail client, send email, reply checks, token revocation.
  - `src/lib/integrations/crypto.ts`: AES-256-GCM encryption for stored refresh tokens.
  - Dependencies: `googleapis` and `google-auth-library`.
- Send flow in `approveOpportunityAction()`:
  - Uses `reserve_send_slot` to atomically move `queued -> sending` under the daily send cap.
  - Sends with Gmail API and stores `gmail_thread_id`, `gmail_message_id`, and `sent_at`.
  - After Gmail returns IDs, never reverts to `queued`; post-send DB failures return a controlled reconciliation error to avoid duplicate sends.
  - Header values are sanitized and the subject is MIME-encoded before Gmail send.
- Reply tracking:
  - `src/app/api/cron/replies/route.ts`.
  - `GET`, bearer `CRON_SECRET`, fail-closed if missing/mismatched.
  - Uses Gmail metadata/minimal thread reads only; does not read message bodies.
  - Advances `sent -> replied` only when the stage transition succeeds.
- Vercel cron:
  - `/api/cron/replies` at `*/30 * * * *`.

## Phase 5 — Watchlist Monitoring

- Watchlist pipeline logic lives in `src/lib/pipeline/watchlist.ts`.
- `addToWatchlist()` is idempotent and returns a discriminated union:
  - `created` for newly inserted rows.
  - `duplicate` for existing rows.
  - `error` for insert/monitor setup failures that callers must handle.
- Exa setup is split into:
  - Webset creation for the company search.
  - Monitor creation via the documented `/websets/v0/monitors` API shape with `websetId`, cron cadence, UTC timezone, and append search behavior.
- Duplicate watchlist adds repair missing monitor state by creating a Webset/monitor when an existing row lacks `webset_id`.
- `processWatchlistAlerts()` ingests Exa Webset items into `watchlist_alerts`, deduping by `source_item_id`; `last_alert_at` updates only when at least one genuinely new alert is inserted.
- `removeFromWatchlist()` deletes the local row and best-effort cleans up the external Exa Webset; cleanup failures are logged but do not block local deletion.
- High-scoring opportunities are auto-added from `steps/score.ts` when normalized score is `>= 80`.
- Watchlist UI:
  - `src/app/(app)/watchlist/page.tsx`
  - `src/app/(app)/watchlist/actions.ts`
  - `src/app/(app)/watchlist/_components/watchlist-client.tsx`
- Watchlist cron:
  - `src/app/api/cron/watchlist/route.ts`
  - `GET`, bearer `CRON_SECRET`, fail-closed if missing/mismatched.
  - Vercel schedule: `/api/cron/watchlist` at `0 11 * * *`.

## Phase 6 — Settings UI

- Settings page files:
  - `src/app/(app)/settings/page.tsx`
  - `src/app/(app)/settings/actions.ts`
  - `src/app/(app)/settings/_components/settings-client.tsx`
- Editable pipeline config:
  - Score threshold: integer `0-100`.
  - Search queries: tag input, max 10, each 1-100 chars.
  - Search locations: tag input, max 10, each 1-100 chars.
  - Daily send cap: integer `0-50`.
- `updateConfigAction()` is authenticated with `requireUser()`, validates all inputs server-side, updates `pipeline_config` with the service client, and verifies a row was actually updated via `.select("id").maybeSingle()`.
- `pipeline_config` remains client-readable only; direct client UPDATE is blocked by RLS because only a SELECT policy exists.
- Pipeline runs consume the updated config on the next run:
  - Discover uses `search_queries` and `search_locations`.
  - Score uses `score_threshold`.
  - Send-slot reservation reads `daily_send_cap`.
- Gmail settings:
  - Settings shows connected/disconnected status plus connect/disconnect controls.
  - `disconnectGmailAction()` calls `revokeToken(user.id)`.
  - `revokeToken()` treats Google revoke as best-effort, but throws on local Supabase credential delete or `gmail_send_address` clear failures so the UI can surface cleanup errors.
- Cron schedule is displayed as read-only Settings information; schedules are owned by `vercel.json`.

## Phase 7 — Polish + Metrics

- Today dashboard metrics were added in:
  - `src/app/(app)/page.tsx`
  - `src/app/(app)/_components/today-client.tsx`
- Header metrics now include:
  - Reply rate across `sent` + `replied`.
  - Sent today versus `daily_send_cap`.
  - Sent this week, bounded Monday 00:00 UTC to next Monday 00:00 UTC.
  - Average score of sent/replied opportunities.
  - Funnel counts for `discovered -> replied`.
- Metric queries are independent and run in parallel via `Promise.all(...)`; average score and funnel counts are computed in app code from minimal column selects (`score`, `stage`).
- Today UI now renders:
  - A 4-card responsive metrics grid.
  - A pipeline funnel row using badge-styled stage/count pills.
  - Existing manual trigger button with inline running state (`Running…` + spinner) still handles the manual pipeline action.
- Loading state polish:
  - `src/app/(app)/loading.tsx` now includes skeletons for the header, four metric cards, funnel bar, and five opportunity cards.
- Discovery error isolation:
  - `src/lib/pipeline/steps/discover.ts` wraps each `createOpportunity(...)` insert in a per-job `try/catch`.
  - A single bad insert is logged with the JSearch job ID and does not abort the rest of the discovery batch.
- Existing Phase 2+ pipeline error handling remains the baseline:
  - Per-opportunity failures in score/research/draft/enrich set `last_error`, release claims, and continue the batch.
  - Enrichment retry behavior still increments `enrichment_attempts` and respects `max_enrichment_attempts`.

## Phase 8 — Onboarding: Self-Serve User Intake

- Onboarding detection: `src/lib/pipeline/onboarding.ts` — `isOnboardingComplete()` checks three records in parallel (user_profile doc, pipeline_config row, feedback_outreach_style doc).
- Onboarding gate: `src/app/(app)/page.tsx` redirects to `/onboard` if incomplete. `DEV_SKIP_ONBOARDING=true` bypasses in development.
- Wizard: `src/app/(app)/onboard/page.tsx` (server) + `onboard/_components/onboard-client.tsx` (client). 4-step wizard: About You → Search Prefs → Outreach → Gmail.
- Server actions: `src/app/(app)/onboard/actions.ts` — `saveProfileAction`, `saveSearchConfigAction`, `saveOutreachAction`. All upsert with `origin: 'onboarding'` and `onConflict` for safe re-runs.
- Context layer: `src/lib/skills/context.ts` — `loadMemoryContext()` resolves `user_profile` first, then falls back to the legacy personal profile key `user_omar_profile`. `CLAUDE.md` is project context only and is no longer used as personal profile fallback.
- Scoring: `src/lib/pipeline/scoring.ts` now includes `user_profile`, `user_positioning`, and `user_dealbreakers` in the key array for `formatMemoryForPrompt()`.
- Drafting: `src/lib/pipeline/steps/draft.ts` now includes `user_profile` and `user_positioning` in the key array. Prompt parameter renamed from `omarProfile` → `senderProfile`. Privacy guard genericized.
- Prompt builders: `email-b2b-customer-support.ts` and `email-head-of-growth.ts` — parameter renamed `omarProfile` → `senderProfile`, template labels genericized (`Omar's Profile` → `Sender Profile`).
- Profile Refresh: Settings links to `/onboard?mode=refresh`, which bypasses the redirect guard and pre-fills all fields.
- Gmail return path: OAuth start route accepts `?return_to=` param, stores in cookie. Callback reads cookie and redirects back (onboarding → `/onboard?step=4`, settings → `/settings?gmail_connected=true`).
- Step deep-linking: Wizard supports `?step=N` URL parameter.
- Dev tooling: `npm run onboard:reset` (deletes onboarding data + scoring profile), `npm run onboard:fixture -- --state=partial|complete|empty`.

## Phase 9 — Prompt De-Omarification + Structured Scoring Profile

- Sender identity layer:
  - `src/lib/skills/sender-identity.ts` defines `SenderIdentity` plus `extractSenderIdentity(ctx, displayName)`.
  - Supports both Phase 8 sectioned onboarding docs and legacy freeform seeded profiles.
  - Required fields: `firstName`, `fullName`, `positioning`, `tools`, `proofPoints`, `outreachTone`.
  - Optional fields: `recentCompany`, `recentCompanyDescriptor`, `recentRole`, `domainInsiderClaim`, `signOff`.
  - `ctx.positioning` is preferred over section parsing when present.
- Prompt conversion:
  - All prompt files were converted from static `*_SYSTEM` exports to builder functions accepting `SenderIdentity`.
  - Converted files:
    - `email-b2b-customer-support.ts`
    - `email-head-of-growth.ts`
    - `full-analysis.ts`
    - `jd-fit-rubric.ts`
    - `company-fit-analyzer.ts`
    - `career-coach.ts`
    - `people-research.ts`
    - `create-prompt.ts`
    - `create-skill.ts`
  - Prompt sections that depend on optional sender fields now use conditional omission instead of empty interpolation.
- Consumer updates:
  - `src/lib/pipeline/scoring.ts`
  - `src/lib/pipeline/steps/draft.ts`
  - `src/lib/pipeline/people-search.ts`
  - `src/lib/jobs/handlers/company-fit-analyzer.ts`
  - `src/lib/jobs/handlers/career-coach.ts`
  - `src/app/(app)/outreach/actions.ts`
  - `src/app/(app)/analysis/actions.ts`
  - `src/app/(app)/workspace-tools/actions.ts`
  - All now extract sender identity from `loadMemoryContext()` and call prompt builders rather than importing static system constants.
- Context cleanup:
  - `src/lib/skills/context.ts` comments and fallback behavior are genericized.
  - Candidate scoring/drafting memory no longer includes `CLAUDE.md`; only personal profile docs are passed into those prompts.
  - `src/lib/skills/index.ts`, `src/app/layout.tsx`, and UI copy were genericized to remove stale Omar-specific naming.
- Structured scoring profile:
  - Migration: `supabase/migrations/20260408000001_user_scoring_profiles.sql`
  - New table: `user_scoring_profiles`
  - Layer 1 derived fields:
    - `role_fit_keywords`
    - `seniority_years`
    - `preferred_stages`
    - `preferred_domains`
    - `tool_familiarity`
    - `proof_points`
    - `dealbreaker_patterns`
  - Layer 2 weights:
    - `weight_role_fit`
    - `weight_seniority`
    - `weight_stage`
    - `weight_domain`
    - `weight_stack`
    - `weight_proof_points`
    - `weight_dealbreaker`
  - Layer 2 structured preferences:
    - `target_roles`
    - `target_locations`
    - `green_flags`
    - `red_flags`
  - Weight columns are constrained to `0.5–2.0` with database `CHECK` constraints.
- Normalization:
  - New file: `src/lib/pipeline/scoring-profile.ts`
  - `normalizeScoringProfile(svc, userId)` derives structured fields from onboarding memory docs + `pipeline_config`.
  - Stage/domain vocabularies are explicit in code.
  - Upsert overwrites derived fields while preserving user-edited weight columns.
  - Triggered after:
    - `saveProfileAction`
    - `saveSearchConfigAction`
    - `saveOutreachAction`
    - `updateConfigAction`
- Scoring enhancement:
  - `src/lib/pipeline/scoring.ts` loads `user_scoring_profiles` with `.maybeSingle()`.
  - Missing row fallback keeps behavior identical to pre-Phase-9 scoring:
    - all weights default to `1.0`
    - structured preference arrays are treated as empty
  - Structured preferences are injected into the full-analysis prompt when a profile row exists.
  - Post-Claude score weighting is applied across JD Fit and Strategic Fit dimensions using the mapping from the Phase 9 plan.
- Settings UI:
  - `src/app/(app)/settings/page.tsx` loads the scoring profile.
  - `src/app/(app)/settings/_components/settings-client.tsx` renders:
    - read-only derived tags for roles/tools/stages/domains
    - weight sliders from `0.5x` to `2.0x`
  - `src/app/(app)/settings/actions.ts` adds `updateScoringWeightsAction` with range validation.
- Verification artifacts:
  - `scripts/test-sender-identity.ts` builds all converted prompts from synthetic sender fixtures and asserts:
    - no Omar/Inkeep leakage
    - sender identity appears where expected
    - optional-null branches produce coherent output
  - `npm run test:sender-identity` runs this script.
  - `onboard:reset` and `onboard:fixture` now also clear/manage `user_scoring_profiles`.

## Phase 10 — Agentic Career-Coach Onboarding Interview

- Replaces the static 4-step wizard with a conversational AI interview as the primary onboarding path. The wizard remains as a "skip to manual entry" escape hatch.
- Migration: `supabase/migrations/20260409000001_onboarding_interviews.sql`.
  - New table: `onboarding_interviews` with partial unique index (one active per user).
  - RLS: SELECT-only for client; all mutations via service-role.
- Onboarding flow:
  - `src/app/(app)/onboard/page.tsx` fetches active interview row + existing form data, renders `OnboardRouter`.
  - `OnboardRouter` shows a choice screen (interview vs manual), then routes to `InterviewClient`, `ReviewClient`, or `OnboardClient` based on state.
  - `InterviewClient` uses `useChat` from `@ai-sdk/react` with `DefaultChatTransport` to stream against `/api/onboard/chat`.
  - `ReviewClient` shows extracted data with inline editing, "Back to interview", and "Confirm & Continue".
- Streaming chat: `src/app/api/onboard/chat/route.ts`.
  - Uses `streamText` with `claude-sonnet-4-6` via `@ai-sdk/anthropic`.
  - `report_topics` tool (AI SDK `tool()` with `inputSchema`) tracks covered topics as structured data.
  - `onFinish` callback persists messages, updates `topics_covered`, and sets `ready_for_extraction` when interview is complete.
  - Server-side message cap: hard limit at 12 assistant messages. At 10+, injects wrap-up instruction. At 12+, forces extraction without generating.
  - Completion detection: primary is `[INTERVIEW_COMPLETE]` marker, fallback heuristic triggers when 5+ topics covered and last message has no question.
- Interview actions: `src/app/(app)/onboard/interview-actions.ts`.
  - `getOrCreateInterviewAction`: finds active interview or creates new one.
  - `checkInterviewStateAction`: lightweight refetch of `ready_for_extraction` + `topics_covered` (used by client after each response).
  - `extractAndReviewAction`: atomic compare-and-set (`eq("status", "in_progress")`) prevents race conditions. Runs Opus extraction, writes `extracted_*` columns, sets status to `review`.
  - `confirmInterviewAction`: sequential idempotent writes — upserts memory docs, pipeline_config, interview_insights, normalizeScoringProfile(), then marks `confirmed`. Stays in `review` on failure.
  - `backToInterviewAction`: sets `status = 'in_progress'` and `ready_for_extraction = false` to prevent auto-extract loop.
  - `abandonInterviewAction`: sets `status = 'abandoned'`.
- Extraction: `src/lib/onboarding/extraction.ts` + `extraction-prompt.ts`.
  - Formats UIMessages into plain-text transcript, sends to `runClaudeJson` with `claude-opus-4-6`.
  - Two output layers: wizard-compatible fields (profile, search, outreach) + richer `insights` (career narrative, decision drivers, strongest stories, etc.).
  - Insights persisted as `memory_document` with key `interview_insights`.
- Interview prompt: `src/lib/onboarding/interview-prompt.ts`.
  - `buildInterviewPrompt()` builds system prompt with optional refresh context.
  - `interviewTools` defines `report_topics` tool with `inputSchema` (zod enum array).
  - Prompt enforces: one question at a time, max 1 follow-up per topic, impatience handling, hard 12-message cap.
- Refresh-mode data preservation:
  - `ReviewClient` uses `topics_covered` to decide whether to trust extracted values.
  - If `search_prefs` was not covered, existing `pipeline_config` values are preserved.
  - If `outreach_style` / `dealbreakers` were not covered, existing outreach/dealbreaker memory docs survive.
  - Extraction defaults never silently clobber saved settings.
- AI SDK v6 patterns used:
  - `useChat` from `@ai-sdk/react` with `DefaultChatTransport` (body includes `interviewId`).
  - `streamText` + `toUIMessageStreamResponse` with `onFinish` for persistence.
  - Tool parts use `tool-${NAME}` type pattern (v6); detection via `isToolUIPart()` + `getToolName()`.
  - `convertToModelMessages` is async in v6 (requires `await`).
- Dev tooling:
  - `scripts/onboard-reset.ts`: also deletes `onboarding_interviews` rows.
  - `scripts/onboard-fixture.ts`: `--interview-state=transcript|review|ready` seeds interview rows for testing.
  - `scripts/test-extraction.ts` / `npm run test:extraction`: runs extraction on transcript fixture, asserts field presence.
  - Scripts load `.env.local` via `dotenv`.

## Phase 11 — Post-Confirm Activation Search

- After onboarding confirm, users are routed to `/activate` instead of the empty Today dashboard.
- Activation engine: `src/lib/pipeline/activation.ts`
  - Calls JSearch with `numPages: 1`, `datePosted: "month"`, then post-filters to last 10 days (excludes undated jobs).
  - Caps at 10 discoveries. Scores each using `claude-sonnet-4-6` (not Opus) for speed (~10-15s/job vs ~80-130s).
  - On dedup hit, checks if existing opportunity is stranded at `discovered` (from interrupted prior run) and scores it.
  - Rank step queries all recent scored/filtered opportunities (retry-safe — not just newly-inserted IDs).
  - Takes top 5 above `score_threshold`, backfills with highest below-threshold results tagged `isCloseMatch`.
  - Fit rationale extracted from `bottom_line` field of analysis result (first two sentences).
  - Sets `pipeline_config.activation_completed_at` on completion.
- API route: `src/app/api/activation/search/route.ts` — POST, authenticated, `maxDuration=300`.
- Activate page: `src/app/(app)/activate/page.tsx`
  - Guards: redirects to `/` if `activation_completed_at` set, to `/onboard` if no config.
  - Renders `ActivationClient` with Gmail connection status.
- Activation client: `src/app/(app)/activate/_components/activation-client.tsx`
  - States: searching (timed reassurance messages), results (flat cards), empty, error.
  - Cards show: company + View Job link, role + posted date, score badge, 2-sentence fit rationale, Skip action.
  - No accordion — all content visible by default.
  - All exit paths (Go to Dashboard, Adjust Settings, Run Deeper Search) call `dismissActivationAction()` before navigating to prevent redirect trap.
  - Gmail prompt shown below results if not connected.
- Dismiss action: `src/app/(app)/activate/actions.ts` — sets `activation_completed_at`, returns error on failure, client blocks navigation if dismiss fails.
- Today page gate: `src/app/(app)/page.tsx` redirects to `/activate` if `activation_completed_at` is null (inside the `!skipOnboarding` block).
- ReviewClient changes: `src/app/(app)/onboard/_components/review-client.tsx`
  - Post-confirm routes to `/activate` (first-time) or `/settings` (refresh).
  - Gmail step removed from ReviewClient — now part of activation results screen.
  - `gmailConnected` prop removed from ReviewClient interface.
- Migrations:
  - `20260410000001_activation_completed_at.sql` — adds `activation_completed_at` to `pipeline_config`.
  - `20260410000002_add_job_posted_at.sql` — adds `job_posted_at` to `opportunities`.
- Extended existing modules:
  - `jsearch.ts`: `searchJobs()` accepts optional `numPages` and `datePosted` params.
  - `scoring.ts`: `scoreOpportunity()` accepts optional `{ model }` override.
  - `opportunities.ts`: `createOpportunity()` accepts `job_posted_at`.
  - `discover.ts`: passes `job_posted_at` through; uses `datePosted: "today"` for daily cron freshness.
  - `types.ts`: `activation_completed_at` on `PipelineConfigRow`, `job_posted_at` on `OpportunityRow`.
- Cron schedule updated: pipeline runs every 12 hours (`0 4,16 * * *`), discovers last-day posts only.

## Phase 12 — Unified Opportunity Card

- Unified `OpportunityCard` across Activate, Today, and History views. One component, one layout, conditional sections based on context.
- Bug fix: `loadAnalysisSummaries()` in `src/app/(app)/_loaders/today-queue.ts` now reads `result.bottom_line` (first 2 sentences, 280 char cap) instead of `result.summary` / `result.executive_summary` which were always null. Today cards now show fit rationale.
- Card layout (flat-first, matches Phase 11 Activate design):
  - Row 1: Company + Stage Badge + Close Match badge (if `isCloseMatch`) + View Job link + Score + conditional chevron
  - Row 2: Role Title + posted date (flex layout — title truncates, date stays visible via `shrink-0`)
  - Row 3: Recipient Name · Title (if present)
  - Row 4: Fit rationale (always visible, from `analysisSummary` prop)
  - Row 5: Action buttons (Skip + Flag for non-terminal; Approve + Edit & Approve for queued)
  - Expand section (only when `hasExpandableContent`): research summary + report link, analysis link, draft picker, error display
- `hasExpandableContent` check: `drafts.length > 0 || !!opportunity.analysis_id || !!opportunity.research_id || !!researchSummary || !!opportunity.last_error`. Chevron only renders when true.
- Research link is gated by `research_id` (not `researchSummary`) so reports with empty summaries still expose the "View full report" link.
- New props on `OpportunityCard`:
  - `isCloseMatch?: boolean` — shows "Close match" badge for backfill cards
  - `onAction?: () => void` — called after successful skip/flag/approve for parent state management
- Activation changes:
  - `ActivationResult` now includes `opportunity: OpportunityRow` field.
  - `rankResults()` in `activation.ts` uses `select("*")` instead of specific columns.
  - `activation-client.tsx` removed: inline card JSX (~60 lines), local `scoreColor`, `handleSkip` callback, `cn`/`formatRelativeTime`/`skipOpportunityAction` imports.
  - Now renders `<OpportunityCard>` with `onAction` callback that removes the card from local `results` state.
- History inherits the unified layout via the shared card — no code changes needed.
- Files modified (4): `_loaders/today-queue.ts`, `_components/opportunity-card.tsx`, `pipeline/activation.ts`, `activate/_components/activation-client.tsx`.

## Evaluations Clean Code Remediation

Correctness-first cleanup of evaluation-consuming surfaces. No storage contracts or prompt contracts were changed; all normalization is read-time only.

- **History dedupe (Step A)**:
  - `history/page.tsx` and `history/actions.ts` replaced inline draft/summary/research loading with calls to shared loaders (`loadDraftsMap`, `loadAnalysisSummaries`, `loadResearchSummaries`) from `_loaders/today-queue.ts`.
  - History analysis summaries now use the same `bottom_line >> summary >> executive_summary` precedence and 2-sentence / 280-char truncation as Today (previously stuck on older `summary ?? executive_summary` contract).
  - `groupByDate()` extracted from both `history/page.tsx` and `history-client.tsx` into the shared `_loaders/today-queue.ts` module. Both server page and client component import from one place.
  - History loaders run in parallel via `Promise.all` (same pattern as the page's initial load and the server action's filtered load).
  - Activation's separate teaser logic in `pipeline/activation.ts` was intentionally left unchanged.

- **Company-fit detail rendering (Step B)**:
  - `analysis/[id]/analysis-detail.tsx` split from one monolithic render into three sub-components: `ImportedMarkdownView`, `CompanyFitView`, `StandardAnalysisView`.
  - Branch selection: `result.imported === true` → imported markdown; `skill_slug === "company-fit-analyzer"` → company-fit; everything else → standard (JD rubric / full analysis).
  - `CompanyFitView` reads the actual flat contract from `company-fit-analyzer.ts`: `what_they_do`, `stage_and_funding`, `gtm_motion`, `market_position`, `strategic_fit`, `total_fit_score`, `verdict`, `green_flags`, `red_flags`, `outreach_angles[]`, `recent_signals[]`, `founder_profile { name, background, worldview }`, `bottom_line`.
  - `ImportedMarkdownView` cleaned up repetitive `(result as Record<string, unknown>)` casts with a shared `Obj` type alias.
  - `StandardAnalysisView` preserves the existing JD rubric and full-analysis rendering exactly as before (nested `jd_fit`, `strategic_fit`, `company_overview`, `outreach_angle` shapes).
  - Added `isObj()` type guard to replace repeated inline `typeof x === "object"` checks.

## Zod Schemas at LLM Boundaries

Replaced hand-rolled `runClaudeJson` + per-field defaulting with AI SDK v6 `generateObject` + zod schemas at the two highest-value LLM boundaries.

- **`src/lib/onboarding/extraction.ts`**:
  - `extractionResultSchema` composes `profileSchema`, `searchSchema`, `outreachSchema`, `insightsSchema`. Each field uses `.default()` so the model omitting an optional value falls through to the prior fallback values (searchQueries → `["Software Engineer"]`, searchLocations → `["Remote"]`, scoreThreshold → 70, dailySendCap → 10, outreachTone → `"casual"`, etc.).
  - `ExtractionResult`, `ExtractionProfile`, `ExtractionSearch`, `ExtractionOutreach`, `ExtractionInsights` now derived via `z.infer` — schema is the single source of truth.
  - Deleted ~50 lines of manual `Array.isArray(...) ? ... : []` / `typeof x === "number" ? ... : default` fallback code.

- **`src/lib/pipeline/scoring.ts`**:
  - Full `analysisSchema` covers the complete JD+strategic-fit output contract: `jd_fit.scorecard` (7 dimensions × `{score, justification}`), `strategic_fit.scorecard` (6 dimensions), `verdict` enums, `requirement_matches`, `company_overview.founder_profile`, `flags.{green,red,orange}`, `outreach_angle`, `positioning_recommendations`, `bottom_line`.
  - `AnalysisResult` type exported via `z.infer`. `ScoringResult.analysisResult` now typed as `AnalysisResult` (was `Record<string, unknown>`).
  - Deleted `extractDimensionScores()` and `extractScore()` helpers (~40 lines) that walked the untyped record defensively. Replaced with direct indexing (`result.jd_fit.scorecard.years_seniority.score`) plus a small `dimensionScores()` helper that flattens the scorecard into `{dim: score}` for the weighted-score calculation.
  - **Behavior change**: malformed LLM output now throws at the `generateObject` boundary rather than silently scoring as 0. The pipeline's per-opportunity error handler (`src/lib/pipeline/opportunities.ts`) catches, sets `last_error`, releases the claim, and continues the batch. Chosen over lenient-with-defaults because silent-zero hid prompt drift and produced false negatives; loud failure surfaces real signal.
  - Note: `analysisResult` is still stored as JSON in the DB and read back as `Json`/`unknown` in UI components. Read-side casts unchanged.

- AI SDK pattern: `generateObject({ model: anthropic("claude-opus-4-6"), schema, system, prompt, maxOutputTokens })`. Model slug format (hyphens, e.g. `claude-opus-4-6`) matches the rest of the codebase.

- Not migrated (yet): `src/lib/pipeline/steps/draft.ts`, `src/lib/pipeline/people-search.ts`, `src/lib/pipeline/pursuit/planner.ts`, `src/lib/jobs/handlers/career-coach.ts`, `src/lib/jobs/handlers/company-fit-analyzer.ts`, `src/app/(app)/actions.ts`, `src/app/(app)/outreach/actions.ts`, `src/app/(app)/workspace-tools/actions.ts`, `src/app/(app)/analysis/actions.ts`. These still use `runClaudeJson`. `runClaudeJson` itself remains in `src/lib/ai/anthropic.ts` for those call sites.
