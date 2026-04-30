# Deferred backlog — GTM Command Center

Living log of features we've considered, cut, and scheduled for future consideration. Separate from per-SPEC non-goals sections — this is the durable catch-all, so items don't vanish when a SPEC ships.

## How this works

- Each item names what it is, which SPEC/decision deferred it, why, and the trigger that should bring it back into scope.
- Triggers are concrete observables — "3+ users ask for X" beats "when it feels right."
- When we ship something from this list, move it to "Shipped" at the bottom with the SPEC reference and date.
- Don't use this as a wishlist. Only items with a genuine "should we build this" question live here.

## Active deferrals

### Automated GTM account discovery (Exa search adapter)

**What.** Takes `user_scoring_profiles.icp_rubric` + `memory_documents.company_icp`, generates Exa queries (firmographic, technographic, hiring-signal, JTBD, trigger-event), runs them, and upserts matching companies into `opportunities` as GTM target accounts with `source='exa'`, `stage='discovered'`. The rest of the existing pipeline (score → research → enrich → draft → send) handles them via the `user_type`-aware scoring branch.

**Deferred from.** SPEC-3. Originally slotted as Phase 7; cut after product call to prioritise onboarding quality as the v1 wedge.

**Why deferred.** SPEC-3's product bet is that a well-synthesized ICP, grounded in real exemplars with disagreement surfacing and per-exemplar provenance, is itself the product — users get an operationalised rubric grounded in pattern-matching instead of a PDF from a consulting engagement. Discovery is distribution; the onboarding is the wedge. Shipping discovery alongside meant two new surfaces to polish (Exa query generation, GTM scoring branch) with neither getting the attention the onboarding deserves.

**Trigger to revisit.** ICP onboarding has shipped and been used by ≥3 real GTM users who confirmed a rubric AND explicitly asked "how do I find accounts that match this?" If users confirm and don't ask — the product is maybe complete at onboarding, and discovery is a different product.

**Dependencies.** SPEC-3 shipped. `user_scoring_profiles.icp_rubric` populated for real confirmed users. GTM scoring branch exists (also deferred — see below).

**Rough scope.** 3–4 commits: Exa query construction from `icp_rubric` (`src/lib/pipeline/steps/icp-discovery.ts`), `/api/cron/icp-discovery` route handler, dedupe logic against `(user_id, 'exa', domain)`, regression test. Build-spec §6 has the concrete Exa patterns — this is bounded work, not open-ended research.

---

### Manual GTM account entry + scoring branch

**What.** "Add target account" dialog with company name + domain + buyer personas. Inserts into `opportunities` with `source='manual'`, `external_id=domain`, `role_title=null`. `src/lib/pipeline/steps/score.ts` branches on `user_type` — job-seeker users get the existing role-fit scoring; GTM users get scoring against `icp_rubric` (firmographics, technographics, signals, disqualifiers, personas). `OpportunityCard` + detail pages render the GTM-shaped object (no role, company + domain + personas prominent).

**Deferred from.** SPEC-3. Originally Phase 6; cut after product call to keep GTM post-confirm as onboarding-only (no manual entry, no pipeline surface for GTM v1).

**Why deferred.** Manual entry was proposed as a band-aid for the missing discovery adapter — so a confirmed GTM user had something to do. Better call: don't build the band-aid. If discovery isn't in v1, the post-confirm GTM surface is the confirmed ICP rubric itself (rendered statically), not a data-entry form. Keeps the GTM product shape honest — onboarding-as-the-product — rather than pretending there's a pipeline when there isn't.

**Trigger to revisit.** Either (a) automated discovery ships and the scoring branch is needed anyway, or (b) confirmed GTM users ask for a "test my rubric against companies I know" feature with enough volume to matter. The second trigger is weaker than the first — discovery is the forcing function.

**Dependencies.** `user_type` column + `icp_rubric` column in place (will ship with SPEC-3). Migration already adds `company_domain`, `trigger_signals`, `buyer_personas` + relaxes `role_title` to nullable, so the schema is ready even after this defer.

**Rough scope.** 3 commits: add-account dialog + server action, scoring branch in `score.ts` (reads `icp_rubric`, scores by dimension match), `OpportunityCard` GTM label handling. Should be bundled with the Exa discovery work — the scoring branch is required for either source.

---

### Positioning rubric template + dashboard nudge card

**What.** Third `InterviewTemplate` — `positioning_rubric`. Interviews a GTM lead on competitive positioning: product truth, current vs. future advantages, enterprise table stakes, competitors, proof points. Extraction produces a structured rubric (build-spec §9 + reference appendix) stored in a new `positioning_rubrics` table. Dashboard nudge card renders for `user_type === 'gtm'` users with ≥5 scored accounts, offering to define positioning. Routes into the new template.

**Deferred from.** SPEC-3. Originally Phase 8 as a nudge scaffold; cut after product call because the ≥5-scored-accounts trigger can't fire without automated discovery.

**Why deferred.** Two gated dependencies: (a) positioning rubrics without grounded accounts to compare against are aspirational, which is exactly the failure mode the template exists to prevent; (b) the nudge trigger needs a real signal (scored accounts) that doesn't exist in SPEC-3's onboarding-only GTM shape. Shipping the template before discovery means users define positioning in a vacuum — same trap as the consulting-PDF ICPs SPEC-3 pitches against.

**Trigger to revisit.** Automated discovery ships + produces scored accounts for real GTM users + those users start asking "how do I sharpen this against competitors?" OR we add a second GTM persona workflow (competitor research, sales enablement) that needs positioning as input.

**Dependencies.** SPEC-3 shipped. Discovery shipped. ≥1 GTM user with ≥5 scored accounts.

**Rough scope.** Its own SPEC. ~5–7 commits: template module, new `positioning_rubrics` table + migration, proof-point-discipline extraction prompt, rubric review UI (table-shaped, different again from both job_search and ICP), dashboard nudge card + dismissal state, refresh flow. Build-spec §9 has the schema; the reference appendix is the gold standard for structure + specificity.

---

### Post-confirm persona reset + export

**What.** `/settings` switch-persona card with confirmation modal, "Download my data" JSON export, destructive cascade that deletes persona-scoped data (artifacts, memory docs with `origin='onboarding'`, `pipeline_config`, `user_scoring_profiles`, `opportunities`, `watchlist`, `watchlist_alerts`) and resets `profiles.user_type` to NULL. Keeps `gmail_credentials` and app-level settings per SPEC-3's reset table.

**Deferred from.** SPEC-3. Originally Phase 8; deferred to a follow-up cleanup SPEC once the GTM happy path is proven in prod. v1 ships a `<SwitchPersonaPlaceholder>` in `/settings` that shows the current persona and says "Contact support to switch" — sets expectation without building destructive infrastructure before we've seen both personas work.

**Why deferred.** Building destructive delete + export + modal copy + tests before we've seen the flow run end-to-end inverts risk. If we learn something about GTM onboarding in prod that changes the data shape, we'd be refactoring the reset flow to match. Ship the happy paths first, then build the escape hatch.

**Trigger to revisit.** ≥1 user hits the placeholder + asks to switch persona, OR a second persona ships and we genuinely expect users to try both, OR the placeholder creates enough friction (e.g., users email support for a reset) that it's worth automating.

**Dependencies.** Both personas shipped and confirmed for real users. Export JSON schema decided.

**Rough scope.** 3 commits: `switch-persona-card.tsx` replacing the placeholder, `resetPersonaAction` + `downloadUserDataAction` in `settings/actions.ts`, regression test asserting keep/delete table matches SPEC-3.

---

### Multi-contact GTM accounts (multi-threading per account)

**What.** Support multiple contacts per target account (one account → N buyers, each with their own outreach thread + reply tracking). Today's `opportunities.recipient_*` fields are singular (one name, one title, one email, one Gmail thread).

**Deferred from.** SPEC-3 non-goals.

**Why deferred.** The `opportunities` schema with singular recipient fields is a load-bearing simplification. Breaking that invariant needs a separate `contacts` table with FK to `opportunities`, a rewrite of the draft/send/reply stages to operate per-contact, and a new UI for contact selection. Meaningful work — and not required for v1 GTM which scopes to single-contact outbound.

**Trigger to revisit.** Confirmed GTM users running outbound (post-discovery) + explicitly asking to multi-thread inside an account. Low-priority until discovery is shipped.

**Dependencies.** Discovery adapter shipped. Manual + automated account scoring shipped.

**Rough scope.** Its own SPEC. ~6+ commits: `contacts` table migration, draft/send/reply rewrites, per-contact UI, reply-attribution logic.

---

### Cross-persona substrate sharing (one account running both templates)

**What.** A single account running `job_search` AND `icp_definition` concurrently, with memory documents + artifacts shared across both personas. Omar himself is the motivating case — currently job-seeking, will be running GTM at whichever company he joins.

**Deferred from.** SPEC-3 — explicitly rejected as v1 scope.

**Why deferred.** The one-persona-per-account invariant is what lets every downstream surface (sidebar, dashboard, pipeline vocabulary) read `user_type` as a single discriminator. Sharing substrate across personas requires templating every surface against a _set_ of personas — a different architecture. SPEC-3 notes this as "v2 scope once multi-template-within-persona proves stable enough to extend across personas."

**Trigger to revisit.** `icp_definition` + `positioning_rubric` both shipped and stable. Multi-template-within-GTM proven. Then, and only then, consider cross-persona.

**Dependencies.** Both GTM templates shipped. `user_type` as a single-value discriminator stops being load-bearing.

**Rough scope.** Its own SPEC. Likely a substantial rearchitecture — `user_type` becomes `active_personas: string[]`, every persona-branching call site updates.

---

### Archive table for reset data

**What.** When a user resets a persona, instead of hard-deleting `opportunities` + `memory_documents` + `pipeline_config`, copy rows into shadow `archived_*` tables and delete originals. User can restore or reference historical pipeline runs.

**Deferred from.** SPEC-3 non-goals.

**Why deferred.** v1 reset feels like "fresh install." The JSON export button on the reset modal covers the user-held-backup case. Archive tables are a real storage cost + a surface-area increase (restore UI, merge conflicts if the user re-onboards then restores). Not worth it until we see users actually request it.

**Trigger to revisit.** ≥1 user asks to undo a reset, OR the reset flow ships and the "Download my data" button is underused (users would rather have server-side archive than local JSON).

**Dependencies.** Post-confirm reset shipped.

**Rough scope.** 4–5 commits: `archived_*` table migrations, copy-on-delete wrapper, restore action, restore UI, regression tests.

---

### Debug infra hardening — tests, streaming visibility, batch error aggregation, OTel

**What.** Three follow-ups to the `debug-infra` branch (10 commits: structured `lib/logger.ts`, `ai_calls` capture table, `runGenerateObject` / `runClaudeJson` / `runClaudeText` wrappers, `useJobPoll` backoff + visibility, `error.tsx` digest surfacing, run-scoped logging across cron + workflow + 5 pipeline files + 6 server actions, `scripts/replay-ai-call.ts`):

1. **Streaming chat `onError` handler** in `src/app/(app)/onboard/_components/interview-client.tsx` — wire `onError` on the `useChat` transport so stream aborts (network drop, function timeout) surface as a toast + log instead of stranding the UI on the last completed turn. Mid-stream failures are currently invisible.
2. **Per-stage aggregated error log** in `src/lib/pipeline/workflow.ts` — workflow steps log per-error individually + final counts, but no `errors: [{ opportunityId, code, message }]` summary at stage end. Today reconstructing "which opportunities failed in this run" requires grepping individual error lines and joining by runId. Should be one line per stage: `{ stage, ok, failed, errors: [...] }`.
3. **Tests for the new debug primitives.** Currently the regression baseline (`scripts/test-pipeline-path.ts` 30/2) only proves the pipeline still runs — nothing asserts:
   - Logger emits valid JSON in prod and includes runId
   - `captureAiCall` writes a row when scope provided, skips when not, writes-on-throw correctly
   - `useJobPoll` backoff increases on consecutive failures, surfaces `pollingStopped` after 5
   - `runGenerateObject` propagates the response while still capturing
4. **`instrumentation.ts` + minimal OpenTelemetry spans** for cross-service traces (Anthropic → Supabase → JSearch / Exa / Firecrawl). Vercel surfaces these in the traces UI for free. Skipped in v1 because structured logs cover ~90% of debugging needs once `runId` correlation works — but spans become valuable when latency starts mattering (right now, debugging is a correctness problem, not a performance one).

**Deferred from.** Debug-infra branch follow-ups. Captured in the audit done 2026-04-22.

**Why deferred.** (1) is blocked on SPEC-3 — `interview-client.tsx` has unrelated WIP and the right time to add the `onError` handler is after the persona-aware chat ships and the file stops moving. (2) and (3) are pure hardening — they don't unlock new behavior, and the existing logs are already a step-change over the prior `console.log + Vercel logs + diagnostic scripts` baseline. Doing them now risks polishing infra nobody's strained yet. (4) is premature — OTel pays off when you have multiple latency consumers asking different questions; today there's one consumer (you, debugging in the Vercel UI).

**Trigger to revisit.** (1): SPEC-3 Phase 6 polish ships and `interview-client.tsx` stops being touched daily. (2): one real incident where you couldn't tell which opportunities failed in a cron run by grepping the workflow log. (3): a regression in the logger / capture / poll primitives ships to prod and isn't caught — that's the test infra paying for itself. (4): you start asking "why is this slow" instead of "why is this wrong."

**Dependencies.** SPEC-3 stable for (1). `ai_calls` migration applied to prod for any test that exercises capture end-to-end.

**Rough scope.** Each is one commit on a `debug-infra-2` branch.

- (1) ~30 lines in `interview-client.tsx` — `onError` callback, toast, structured log with stream metadata.
- (2) ~50 lines across `workflow.ts` step functions — collect errors into a local array, log on stage exit. Step result types already include `errors: number`; extend to `errors: ErrorSummary[]`.
- (3) New `scripts/test-debug-infra.ts` — ~150 lines, mirrors `test-pipeline-path.ts` style (in-process assertions, no test framework). Asserts JSON shape, capture write/skip, poll backoff via fake timers.
- (4) `instrumentation.ts` ~20 lines (`@opentelemetry/api` already implicit via `@vercel/otel`); minor wrapping in `lib/ai/anthropic.ts` + `lib/pipeline/jsearch.ts`. New env: nothing — Vercel auto-collects.

**Out of scope (remains deferred).** Sentry / Axiom / DataDog. Vercel's free function-log UI plus the `ai_calls` table + `replay-ai-call.ts` covers ~95% of debugging needs at single-user scale. The next paid observability layer pays for itself only with multi-user ops or paid alerting — neither currently relevant.

---

### TheirStack industry + keyword-slug filter lookup tables

**What.** `icpToTheirStackFilters()` currently omits `industry_id_or` and `company_keyword_slug_or/not` from the TheirStack query even though the rubric has `firmographics.industries` and `technographics.required_tools/excluded_tools`. Those TheirStack filters require LinkedIn Industry Codes V2 (numeric) and TheirStack's internal slug vocab, neither of which is a 1:1 mapping from the rubric's free-text fields.

**Deferred from.** icp-pipeline Phase 2 (`.claude/plans/icp-account-pipeline-theirstack.md` Open Questions §1 + §2).

**Why deferred.** Two options were considered: (a) ship a static JSON map of the top ~150 LinkedIn industries and ~100 tool slugs; (b) call TheirStack's lookup endpoint per run. Neither is load-bearing for Phase 2's value prop — the scoring prompt (`buildIcpAccountFitPrompt`) uses industries + required_tools + excluded_tools directly in the rubric section, so every candidate TheirStack returns still gets scored against those dimensions. The only cost of deferring is that TheirStack's upstream filter is broader than ideal (more candidates to score → more credit spend), not that rubric dimensions are ignored.

**Trigger to revisit.** When credit spend becomes a constraint (current cron schedule ≈ 8 pulls × 25 jobs/week = 200 credits, comfortably inside the free tier), OR when a third rubric lands that uses industry/tech filtering as its primary discriminator.

**Rough scope.** 1–2 commits: static JSON maps in `src/lib/integrations/theirstack-vocab.ts` covering the top N industries + slugs; mapping function consults the map, falls back to omitting the filter on miss; surface map coverage in the discover-accounts log line so we know when coverage is too sparse.

---

### Live SSE stream for orchestrator reasoning

**What.** Real-time streaming of the orchestrator's per-dimension inference to the status panel via SSE (`/api/onboard/orchestrator/stream`), using AI SDK v6 `streamText` with `sendReasoning: true`. Replaces v1's saved-state polling.

**Deferred from.** SPEC-2 Phase 3.

**Why deferred.** SPEC-2 shipped with saved-state polling — status panel renders from `orchestrator_state` and refreshes after artifact ingest + each chat turn. Adequate for v1. Live streaming is an additive change if the current experience feels flat in practice.

**Trigger to revisit.** User feedback that the status panel feels static or delayed, OR the onboarding funnel shows drop-off at the "waiting for orchestrator" transition.

**Dependencies.** SPEC-2 shipped (done).

**Rough scope.** 2 commits: SSE route handler + client subscription; `orchestrator-status-panel.tsx` wires to the stream instead of polling.

---

### ICP-shaped comment mining for published video content (yt-llm Loop 2)

**What.** Drop a published YouTube URL → pull transcript + comments via yt-llm, fingerprint each commenter (channel name, bio, prior comment patterns), score whether they look ICP-shaped against the user's confirmed `icp_rubric`, cluster sentiment + theme (objection / praise / question / feature ask), cross-reference comment timestamps with transcript moments to surface "what content triggered ICP engagement." ICP-shaped commenters seed the existing account discovery pipeline as `source='yt_comments'` opportunities. Output: % of commenters that look ICP-shaped, top objections from them, deep-linked engagement moments, lookalike accounts queued.

**Deferred from.** Brainstorm 2026-04-29 — yt-llm integration scoping for GTM persona. Loop 1 (synthetic pre-publish ICP screening) is the wedge; Loop 2 is the integration that ties published video content into the existing pipeline.

**Why deferred.** Three blockers stacked:

1. **yt-llm v0.1 doesn't surface comments.** `yt-dlp --with-comments` is forwarded but the bundle drops them. Either contribute upstream (we own yt-llm — cheapest path), hit YouTube Data API v3 directly (OAuth quota + per-day cap pain), or wait for v0.2.
2. **Loop 1 hasn't shipped.** The synthetic-ICP-review output needs to prove useful first — if directional persona reactions don't land, the harder problem of real-commenter mining isn't worth the upstream work or the runtime cost (`yt-dlp` shell-out per URL).
3. **Multi-tenant ICP is unresolved.** Current `icp_rubric` is single-user-shaped; the "B2B marketer with their own ICP" framing requires either reusing the rubric structurally with a different mode or building a parallel ICP definition flow.

**Trigger to revisit.** Loop 1 ships AND ≥1 GTM user with a confirmed ICP rubric explicitly asks "can I see who's commenting on my videos?" OR yt-llm v0.2 lands comments support and the upstream cost drops to near-zero, making it cheap to spike behind a flag.

**Dependencies.** Loop 1 shipped. yt-llm comments support (upstream contribution or v0.2). GTM scoring branch (deferred separately — see "Manual GTM account entry + scoring branch"). `yt-dlp` runtime decided (Vercel Sandbox vs sidecar worker — yt-llm shells out to a Python binary, can't run in a standard Vercel function).

**Rough scope.** Its own SPEC. ~6–8 commits: yt-llm comments contribution OR Data API v3 adapter, commenter fingerprint + ICP-fit scoring (reuse existing scoring infra), sentiment/theme extraction prompt, transcript↔comment timestamp join, opportunity seeding with `source='yt_comments'`, review UI surface, regression test against captured fixture (transcript + comments JSON).

---

### Competitive content listening (yt-llm Loop 3)

**What.** Point yt-llm at competitor or category-adjacent YouTube channels → pull transcripts of top-view videos, run typed LLM extraction over each (positioning claims, topic clusters, objection-handling moves), repeat the Loop 2 commenter ICP-fit pass to surface "what narratives are our ICP nodding along to right now." Output is a category-level positioning-narrative map across channels, not per-video — fuel for messaging differentiation.

**Deferred from.** Brainstorm 2026-04-29 — yt-llm integration scoping for GTM persona. Lowest priority of the three loops.

**Why deferred.** Loop 3 is a category-listening surface, not a wedge. It requires Loops 1 and 2 to both work — Loop 1 for the persona-reaction substrate, Loop 2 for the commenter ICP-fit primitive. Building it standalone before either ships means producing a category narrative map nobody has validated against their own content first. Inherits the same `yt-dlp` runtime constraint and comments-support gap as Loop 2, plus channel-uploads enumeration isn't first-class in yt-llm today (channel feeds are reachable via yt-dlp's playlist surface, but top-N-by-view-rate selection has to be done by the caller).

**Trigger to revisit.** Loops 1 and 2 both shipped + ≥1 GTM user using them in production + that user explicitly asks "what are competitors saying that my ICP is engaging with?" OR an inbound positioning-research workflow shows up that needs category narrative mapping as a primary input. The Positioning Rubric template (also deferred) is a natural co-traveller — its proof-point discipline is sharper if there's a category narrative map to point at.

**Dependencies.** Loops 1 and 2 shipped. Channel-uploads enumeration helper (small adapter on top of yt-llm's playlist surface). Positioning rubric template makes the output more actionable but isn't strictly required.

**Rough scope.** Its own SPEC. ~5–7 commits: channel-uploads enumeration helper, top-N selection by view-rate, per-video positioning-claims extraction prompt, cross-video narrative clustering, ICP-engagement aggregation reusing Loop 2's commenter scoring primitive, category-map UI surface.

---

## Open product questions

Not deferred — these are live decisions we'll need to make, tracked here so they don't get lost.

### Watchlist semantics under GTM

**Question.** The existing Watchlist feature tracks companies-of-interest via Exa Websets (auto-alerts for funding, hires, launches, press, job postings, leadership changes). Under `user_type='gtm'`, is Watchlist (a) the same feature with different empty-state copy, (b) repurposed as "Target account signal monitor" feeding trigger events into `opportunities.trigger_signals`, or (c) hidden entirely until discovery ships?

**Why it matters.** Watchlist is the one existing feature that's genuinely persona-agnostic (company tracking is company tracking). If it survives the GTM fork without modification, the sidebar doesn't need to branch as much.

**Resolution trigger.** Decide during SPEC-3 Phase 6 (sidebar + vocabulary) implementation. Default to (a) for v1 unless (b) proves cheap.

---

### Refresh-mode semantics for GTM

**Question.** `/onboard?mode=refresh` currently re-runs job_search onboarding against existing memory docs. Under GTM, does refresh (a) re-run the full ICP interview with new exemplars, (b) allow editing the confirmed rubric directly without re-interviewing, or (c) both, with a choice at entry?

**Why it matters.** ICP rubrics drift — new customers, new disqualifiers, new signals. Users will refresh more often than job seekers do. The right refresh UX matters more for GTM than it does for job_search.

**Resolution trigger.** After SPEC-3 ships and a real GTM user wants to update their ICP. Decision can wait.

---

### Research enrichment shape for GTM accounts

**Question.** For job_search, research enrichment pulls company research via the research pipeline and attaches `research_id`. For GTM accounts, what's enriched — company financials, tech stack detection, buyer-persona LinkedIn lookup, trigger-event crawl? And is it triggered by scoring (auto-enrich high-scoring accounts) or by user action (click to enrich)?

**Why it matters.** Without research enrichment, GTM scoring is shallow (scores on declared fields + domain only). Research is what makes the ICP rubric earn its keep — "this account matches because of X, Y, Z signals our rubric weights."

**Resolution trigger.** When Exa discovery + manual entry are both shipped and accounts are flowing through scoring. Research shape should be informed by what the pipeline actually produces.

---

## Shipped

Items that started on this list and have since shipped. Populate as we go.

### Drop legacy `extracted_*` columns (2026-04-25)

**What shipped.** Removed the four legacy JSONB columns (`extracted_profile`, `extracted_search`, `extracted_outreach`, `extracted_insights`) from `onboarding_interviews`. All consumers now read and write through the unified `extracted` JSONB column.

- Migration `20260425212052_drop_legacy_extracted_columns.sql` reassembles `extracted` from the legacy columns for any row that still had NULL there (belt-and-braces over the original Phase 1.b backfill), then drops the four columns.
- Removed dual-writes from `extraction-actions.ts`, `interview-actions.ts`, `story-actions.ts`, `api/onboard/chat/route.ts`, and `api/onboard/story/stream/route.ts`.
- Switched readers (`story-client.tsx`, `review-job-search.tsx`) to read job_search-shaped fields out of `interview.extracted`.
- Dropped the fallback-reassemble path in `confirm-logic.ts`; the function now reads `interview.extracted` directly.
- Updated `OnboardingInterviewRow` type, four scripts (`test-onboarding-confirm.ts`, `rehydrate-review.ts`, `onboard-to-review.ts`, `onboard-fixture.ts`).

**Verification.** `npm run build` clean.

---

### Debug infrastructure baseline (2026-04-22)

**What shipped.** Replaced the `console.log + Vercel function logs + 26 one-shot diagnostic scripts` debugging story with run-scoped structured logging, AI call replay, and client poll visibility. Branch: `debug-infra` (10 commits).

- `src/lib/logger.ts` — `createLogger({ runId, userId, opportunityId, stage, scope })`, `child()` for context inheritance, JSON in prod / pretty in dev, `serializeError` captures stack. Web Crypto for runId so workflow runtime stays compatible.
- `supabase/migrations/20260422000001_ai_calls.sql` — service-role-only debug table capturing every model call: prompts, response, tokens, latency, error, with `(run_id, scope_table, scope_id, call_purpose)` correlation.
- `src/lib/ai/calls.ts` — `runGenerateObject` wrapper + `captureAiCall` best-effort writer with module-singleton service client. `lib/ai/anthropic.ts` `runClaudeJson` / `runClaudeText` accept optional `scope`.
- `runId` plumbed through cron handlers (`/api/cron/{pipeline,replies,watchlist}`) → `pipelineWorkflow` → every step (`discover, score, research, enrich, draft, planPursuits, executePlans, recoverStranded`) → into pipeline files (`jsearch, watchlist, steps/discover, pursuit/execute-plan, activation`). Net: zero raw `console.*` in `src/lib/pipeline/**`.
- 11 of 12 LLM call sites now capture (scoring, draft, planner, people-search, orchestrator analyze + update_dimension, manual-inject, jdRubric, createPrompt, createSkill, careerCoach, companyFitAnalyzer).
- All 6 write server actions (`approve, skip, flag, applyManually, editDraft, manualInject`) gain scoped loggers recording intent + outcome.
- `useJobPoll` exponential backoff (3s → 30s) with give-up after 5 consecutive failures; surfaces `fetchError` + `pollingStopped` to consumers. `analysis-detail.tsx` + `research-detail.tsx` render a destructive Alert with refresh prompt instead of an infinite spinner.
- `src/app/(app)/error.tsx` captures + renders `error.digest` so users can quote it when reporting bugs.
- `scripts/replay-ai-call.ts` — replay by id, list by `--opp <id>` / `--run <id>` / `--interview <id>`, diff captured response vs fresh call.

**Audit context.** Original plan: `.claude/plans/you-are-a-debug-peppy-puppy.md` (Phase 1 logger / Phase 2 AI capture / Phase 3 client visibility / hotfix for Workflow `node:crypto` ban). Self-audit found over-engineering (unused `debug` level, `formatValue` truncation, `shortId` truncation, dead `schema_summary` column) and gaps (only `generateObject` wrapped initially, ~30 of ~50 console.\* still raw, server actions silently throwing, useJobPoll fix invisible to consumers, 3 redundant runIds). All audit findings closed in commits A–F on the same branch.

**Verification.** `scripts/test-pipeline-path.ts` regression baseline 30 PASS / 2 FAIL preserved across all 10 commits (the 2 fails are pre-existing test-file string assertions unrelated to this work). `npx tsc --noEmit` clean. `pnpm dev` workflow bundle: `Created manifest with 12 steps, 1 workflow`.

**Follow-ups.** See "Debug infra hardening" in the active deferrals section above.
