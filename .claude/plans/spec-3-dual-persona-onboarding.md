# SPEC-3 — Dual-persona onboarding (Job seeker + GTM team fork)

## Context

`docs/SPEC-3.md` forks `/onboard` into two first-class flows — `job_search` (existing) and `icp_definition` (new) — gated by a persona chooser that lands before any template is instantiated. The write-timing rule is load-bearing: `profiles.user_type` is only written at first onboarding confirm; pre-confirm, the in-progress template lives on `onboarding_interviews.template_id` exclusively.

The fork rides on SPEC-2's agentic orchestrator. The ICP template uses the same chat-driven agentic substrate as `job_search` — same artifact drop → orchestrator synthesis → interviewer asks only what's still uncertain → review → confirm — with a different `rubricSchema`, `dimensions`, `systemPrompt`, and `outputs[]`. The review UI becomes a different screen category (synthesis + comparison across N heterogeneous exemplars), not a variation of the one-subject confirmation layout.

`opportunities` gets three new nullable columns and `role_title` relaxed to nullable so the schema can carry GTM accounts later. No GTM pipeline surfaces ship in v1 — no manual account entry, no automated discovery, no GTM scoring branch. Post-confirm, a GTM user lands on a static ICP dashboard that renders their confirmed rubric + narrative. **The onboarding experience is the v1 product wedge.** Distribution (discovery, outreach, pipeline output) is tracked in `docs/DEFERRED.md`.

Legacy `job_search` path stays green byte-for-byte. `npm run test:onboarding-confirm` and `npm run test:confirm-adapter` pass on every commit.

### Rev 3 changes

- **Phase 6 removed.** No manual GTM account entry, no GTM scoring branch, no `OpportunityCard` GTM variant. The post-confirm GTM surface is a read-only ICP dashboard.
- **Exa discovery adapter confirmed deferred** to a follow-up SPEC. Tracked in `DEFERRED.md`.
- **Phase 7 (reset) reduced to a placeholder card.** Full reset/export deferred to a follow-up SPEC. Tracked in `DEFERRED.md`.
- **Positioning nudge + template fully removed** from SPEC-3. Tracked in `DEFERRED.md`.
- Artifact persistence across pre-confirm switches via `ON DELETE SET NULL` + reassignment action (confirmed from Rev 2).
- `profiles.user_type` backfill for existing confirmed users (confirmed from Rev 2).
- Exemplar-scarcity thresholds (0 / 1–2 / 3+ positive exemplars) enforced as a product rule (confirmed from Rev 2).

## Current state — Phase 2/3 unblocker delta

CLAUDE.md's "Outstanding for Phase 2 / Phase 3" list is load-bearing. Grepped the code — every item is still pending:

| Item                                                                                 | Status      | Evidence                                                                                                                |
| ------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `isOnboardingComplete()` hardcodes job_search memory doc keys                        | **Pending** | `src/lib/pipeline/onboarding.ts:21-36` queries `user_profile` + `feedback_outreach_style` + `pipeline_config` literally |
| `normalizeScoringProfile()` reads job_search-shaped sections                         | **Pending** | `src/lib/pipeline/scoring-profile.ts:54-89` reads `"Career Highlights"`, `"Positioning"`, `"Technical Tools"`, etc.     |
| `ReviewClient` renders 4 fixed job_search sections; `clientTemplate.id` unused       | **Pending** | `review-client.tsx:253-294` unconditionally mounts `ReviewSectionProfile/Search/Outreach/Insights`                      |
| Refresh-mode fallback reads literal `topics_covered` keys                            | **Pending** | `review-client.tsx:88-91` hardcodes `"search_prefs"`, `"outreach_style"`, `"dealbreakers"`                              |
| `runExtractionFromTranscript` returns `Promise<ExtractionResult>` (job_search shape) | **Pending** | `src/lib/onboarding/extraction.ts:50,67-83` — type is `z.infer<typeof extractionResultSchema>` keyed to job_search      |
| 4 `extracted_*` JSONB columns instead of unified `extracted` JSONB                   | **Pending** | `src/lib/supabase/types.ts:237-254` still has `extracted_profile/search/outreach/insights`                              |

Plus SPEC-3-specific surface audit:

| Item                                                                  | Status                  | Notes                                                                                                                                           |
| --------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles.user_type` column                                           | **Missing**             | No migration; `ProfileRow` has no `user_type` field.                                                                                            |
| `opportunities.role_title`                                            | **NOT NULL**            | `20260407000001_pipeline_v2.sql:39`. Must drop NOT NULL so the schema can carry GTM rows in a future SPEC.                                      |
| `opportunities.company_domain` / `trigger_signals` / `buyer_personas` | **Missing**             | Schema-only addition in SPEC-3 — no code reads them in v1 (no GTM pipeline surface).                                                            |
| `onboarding_artifacts.interview_id` FK                                | **CASCADE**             | `20260421000001_agentic_onboarding.sql:16`. Breaks pre-confirm persistence across switches — abandoning nukes artifacts.                        |
| Artifact load path is interview-scoped                                | **Coupled**             | `run.ts:54` filters `.eq("interview_id", ...)`. No cross-interview reuse path today.                                                            |
| Sidebar nav vocabulary                                                | **Fixed**               | `src/components/sidebar-nav.tsx:23-29` hardcoded; no branch on `user_type`.                                                                     |
| `onboard/page.tsx` interview lookup                                   | **Hardcoded**           | `page.tsx:79` has `.eq("template_id", "job_search")`. Needs persona-scoped fetch once persona is known.                                         |
| `InterviewTemplateId` union                                           | **Too narrow**          | `types.ts:4` is `"job_search"` literal. Widen to include `"icp_definition"`.                                                                    |
| `onboarding_artifacts.kind`                                           | **Open text**           | No CHECK constraint. ICP kinds (`positive_example`, `negative_example`, `buyer_persona`, `company_context`) added via template's `kindOptions`. |
| `user_scoring_profiles` shape                                         | **Job-search-only**     | Add a nullable `icp_rubric jsonb` column so confirm can write a structured ICP.                                                                 |
| Existing confirmed users (pre-SPEC-3)                                 | **Have no `user_type`** | Backfill needed so they don't land on the persona picker after already completing onboarding.                                                   |

## Confirmed decisions

All seven decisions below are approved (per user confirmation). Recorded here so the implementer doesn't re-litigate.

1. **`user_scoring_profiles.icp_rubric jsonb`.** Nullable column. Job-search rows leave it NULL; GTM rows leave job-search columns NULL.
2. **Exa automated discovery deferred** to follow-up SPEC. Tracked in `DEFERRED.md`. SPEC-3's product bet is onboarding quality, not pipeline distribution.
3. **Positioning rubric + nudge fully out** of SPEC-3. Tracked in `DEFERRED.md`.
4. **Reset/export placeholder only in v1.** Full reset infra deferred to follow-up SPEC. Tracked in `DEFERRED.md`.
5. **Artifact persistence: FK `SET NULL` + reassignment action.** Pre-confirm persona switch keeps artifacts alive.
6. **User backfill.** Migration sets `user_type = 'job_seeker'` for users with existing `pipeline_config`; safety net in `/onboard/page.tsx` handles edge cases.
7. **Exemplar-scarcity thresholds** (0 / 1–2 / 3+ positive exemplars) enforced in orchestrator prompt + confidence clamp + review banner.

## Hard constraints

- `profiles.user_type` written **only at confirm**, never on persona-card click, never on pre-confirm template switch.
- Legacy `job_search` regression tests green through every commit.
- Phase 2/3 unblockers land **before** the persona picker ships.
- `opportunities.role_title` relaxed to nullable; three new nullable GTM columns added. No GTM row-writing code ships in v1.
- Artifacts survive pre-confirm persona switches.
- Gmail credentials + app-level settings untouched throughout SPEC-3.
- ICP onboarding experience mirrors the job_search agentic chat (same artifact drop → orchestrator → interviewer → review flow) — same UX shape, different content.

## v1 build plan — phases

One commit per phase sub-section. Phase 0 is independent and first.

### Phase 0 — Regression guardrails

Green on `main` before any SPEC-3 code lands.

- Extend `scripts/test-onboarding-confirm.ts` to assert `template_id = 'job_search'` throughout the confirm flow.
- Extend `scripts/test-confirm-adapter.ts` — keep 24/24 green as `toJobSearchConfirmEdits` stays bit-identical.
- Add `scripts/test-onboarding-complete-per-template.ts` — asserts `isOnboardingComplete(svc, userId, 'job_seeker')` returns `true` for a seeded job-search user before and after Phase 1's template-aware rewrite.
- Add `scripts/test-scoring-normalize-per-template.ts` — asserts `normalizeScoringProfile` produces the same columns before and after Phase 1.

All four scripts run green on every commit touching `templates/`, `orchestrator/`, `artifacts/`, `pipeline/onboarding.ts`, `pipeline/scoring-profile.ts`, or `confirm-logic.ts`.

### Phase 1 — Phase 2/3 unblockers (no UI persona fork yet)

Hallway work. Nothing user-visible ships.

#### Commit 1.a — Unified `extracted` JSONB column + backfill

Migration `<stamp>_onboarding_extracted_unified.sql`:

- `ALTER TABLE onboarding_interviews ADD COLUMN extracted jsonb` (nullable).
- Backfill `UPDATE ... SET extracted = jsonb_build_object('profile', extracted_profile, 'search', extracted_search, 'outreach', extracted_outreach, 'insights', extracted_insights) WHERE extracted IS NULL`.
- Legacy 4 columns stay — drop in a cleanup commit (tracked in `DEFERRED.md`) after Phase 3 stabilises.

Types: add `extracted: Record<string, unknown> | null` to `OnboardingInterviewRow`. No consumer change this commit.

#### Commit 1.b — Extraction generics + confirm-path rewrite

- `src/lib/onboarding/extraction.ts`: parameterize `runExtractionFromTranscript<X>(messages, template): Promise<X>`. Move `extractionResultSchema` + `ExtractionResult` into `templates/job-search.ts` (each template owns its own).
- `src/app/(app)/onboard/confirm-logic.ts`: read `interview.extracted` with a fallback to reassembling from the 4 legacy columns if `extracted` is NULL.
- `interview-actions.ts`: dual-write `extracted` + the 4 legacy columns on extraction. Dual-write removed in the DEFERRED cleanup commit.

Tests stay green.

#### Commit 1.c — Template-aware `isOnboardingComplete`

- `InterviewTemplate` interface gains `completionCheck: (svc, userId) => Promise<{ complete: boolean; completedSteps: number[] }>`.
- `templates/job-search.ts` provides the current 3-row check.
- `src/lib/pipeline/onboarding.ts`: `isOnboardingComplete(svc, userId, userType)` delegates to the template. Default userType `'job_seeker'` until Phase 2.

#### Commit 1.d — Per-template scoring normalizer

- `InterviewTemplate` gains optional `normalizeScoringProfile?: (svc, userId) => Promise<void>`.
- Move `scoring-profile.ts:normalizeScoringProfile` body into `templates/job-search.ts`'s normalizer. Top-level becomes a dispatcher.

#### Commit 1.e — ReviewClient template-switching seam (empty ICP stub)

- `ReviewClient` dispatches on `clientTemplate.id`:
  - `'job_search'` → existing 4-section layout, lifted into `<ReviewJobSearch>` container file.
  - `'icp_definition'` → new `<ReviewIcp>` stub (real content in Phase 5).
- Refresh-mode `topics_covered` hardcoded keys move into `templates/job-search.ts` as `refreshTopicsMap`.
- `ClientInterviewTemplate.id` widens to `InterviewTemplateId`. `InterviewTemplateId` widens to `"job_search" | "icp_definition"`.

End of Phase 1: Phase 2/3 unblockers live. Nothing user-visible changed.

### Phase 2 — Schema additions + backfill

#### Commit 2.a — `profiles.user_type` + opportunities GTM columns + artifact FK relax + user backfill

Migration `<stamp>_dual_persona_schema.sql`:

- `ALTER TABLE profiles ADD COLUMN user_type text CHECK (user_type IN ('job_seeker', 'gtm'))` (nullable).
- `ALTER TABLE opportunities ALTER COLUMN role_title DROP NOT NULL`.
- `ALTER TABLE opportunities ADD COLUMN company_domain text, ADD COLUMN trigger_signals jsonb, ADD COLUMN buyer_personas jsonb`. Schema-only — no code reads these in SPEC-3 v1.
- **Artifact FK relax:** drop + recreate `onboarding_artifacts_interview_id_fkey` with `ON DELETE SET NULL`.
- **Backfill:** `UPDATE profiles SET user_type = 'job_seeker' WHERE user_id IN (SELECT user_id FROM pipeline_config)`.

Types: add `user_type: 'job_seeker' | 'gtm' | null` to `ProfileRow`; `role_title` becomes nullable on `OpportunityRow`; add `company_domain`, `trigger_signals`, `buyer_personas`.

#### Commit 2.b — `user_scoring_profiles.icp_rubric`

- Migration: `ALTER TABLE user_scoring_profiles ADD COLUMN icp_rubric jsonb`.
- `UserScoringProfileRow`: add `icp_rubric: Record<string, unknown> | null`.

#### Commit 2.c — Backfill safety net in `/onboard/page.tsx`

- `/onboard/page.tsx` reads `user_type` from `profiles`.
- If `user_type IS NULL` AND `isOnboardingComplete(svc, userId, 'job_seeker')` returns true, write `user_type = 'job_seeker'` and redirect to `/`. Only non-confirm write of `user_type` in the codebase — commented in-line.

### Phase 3 — `icp_definition` template

Built behind the scenes; `/onboard?template=icp_definition` reachable but not advertised. Omar dogfoods before picker exposure.

#### Commit 3.a — Template module

`src/lib/onboarding/templates/icp-definition.ts`:

- `agenticMode: true`.
- Topics + topicLabels per build-spec §8: `product`, `buyer`, `firmographics`, `technographics`, `signals`, `disqualifiers`, `proof_points`.
- `dimensions` — 7 keys, `confidenceThreshold: 0.75` default.
- `rubricSchema` — zod schema per build-spec §8.
- `extractionSchema` — zod schema keyed by `product`, `icp`, `scoring`, `proof_points`.
- `orchestratorSystemPrompt(ctx)` — reframed around exemplar synthesis. Pre-contextualizes artifacts by `kind`. Includes exemplar-scarcity thresholds (decision #7): 0 / 1–2 / 3+ positive-example handling.
- `interviewerSystemPrompt(ctx, nextDimension)` — exemplar-vs-declarative disagreements highest priority. When positive count 1–2, opens with "I have only a couple of examples — is this representative or would you add more?"
- `outputs[]`:
  - `memory_doc` `company_icp` (narrative summary).
  - `memory_doc` `icp_proof_points`.
  - `memory_doc` `icp_disqualifiers`.
  - `pipeline_config` transform — writes a minimal config (empty `search_queries`, default `daily_send_cap`). Not used by any pipeline in SPEC-3; reserves the slot for the future discovery adapter.
  - `scoring_profile_normalize`.
- `completionCheck(svc, userId)` — counts `company_icp` memory doc + `icp_rubric` populated + `pipeline_config` row.
- `normalizeScoringProfile(svc, userId)` — reads `company_icp` + `icp_proof_points` + `icp_disqualifiers` + `extracted`; writes `icp_rubric` JSONB (`firmographics`, `technographics`, `signals`, `disqualifiers`, `proof_points`, `buyer_personas`).
- `editsSchema` — zod for the review-screen edits shape.
- `userTypeOnConfirm: 'gtm'`.

Register in `templates/index.ts:REGISTRY`. `getDefaultTemplate()` still returns `JOB_SEARCH_TEMPLATE`.

#### Commit 3.b — Artifact kind options + exemplar-scarcity clamp

- `ArtifactInput` gets `kindOptions` from the active template (new `ClientInterviewTemplate` projection). Job-search shows `resume / linkedin / personal_site / other`; ICP shows `positive_example / negative_example / buyer_persona / company_context`.
- `toClientTemplate()` projects `kindOptions: Array<{ value: string; label: string }>`.
- `src/lib/onboarding/orchestrator/run.ts` — when `templateId === 'icp_definition'`, computes positive-example count from `onboarding_artifacts` and injects into the orchestrator prompt context. Post-process confidence clamp: exemplar-derived dimensions capped at 0.6 when positive count is 1–2.

#### Commit 3.c — ICP confirm adapter + `user_type` write

- `to-confirm-edits.ts`: add `toIcpConfirmEdits(state, finalEdits?)` mirroring `toJobSearchConfirmEdits`.
- `confirmInterviewAction`: dispatch on `template.id`.
- `performConfirm` writes `profiles.user_type` from `template.userTypeOnConfirm` after outputs succeed. Idempotent upsert — only writes if current value is NULL or equal.
- `scripts/test-icp-confirm.ts` — seed ICP interview with 3+ positive exemplars, confirm, assert `company_icp` + `icp_rubric` + `profiles.user_type = 'gtm'`.
- `scripts/test-icp-confirm-low-exemplar.ts` — seed with 1 positive exemplar, confirm, assert confidence-cap rule + confirm succeeded.

### Phase 4 — Persona picker + artifact persistence across switches

#### Commit 4.a — Artifact reassignment primitive

Relies on Phase 2.a FK relax.

- `src/lib/onboarding/artifacts/reassign.ts`:
  - `reassignArtifactsAction(fromInterviewId, toInterviewId)` — updates `onboarding_artifacts.interview_id` for current user.
  - `claimOrphanedArtifactsAction(interviewId)` — claims `interview_id IS NULL` rows into the new interview. Defensive.
- `src/lib/onboarding/orchestrator/run.ts:loadArtifactsForInterview` gains `includeOrphaned` flag (default `false`) for pre-confirm read paths.
- `scripts/test-artifact-persistence.ts` — create interview A, ingest artifact, abandon A, create interview B (different template), reassign, assert artifact now on B with unchanged `normalized_markdown`.

#### Commit 4.b — Persona picker UI

- `src/app/(app)/onboard/page.tsx`:
  - Reads `profiles.user_type`.
  - If set and onboarding complete: redirect to `/`.
  - If NULL: resolve template from URL param (`?template=icp_definition` / `?template=job_search`) or show persona chooser.
  - Drop `.eq("template_id", "job_search")` hardcode; fetch by resolved template id.
- `persona-picker.tsx` — two cards ("For my job search" / "For my company"). Click calls `getOrCreateInterviewAction(isRefresh, templateId)` then `router.push(/onboard?template=${templateId})`. Does **not** write `profiles.user_type`.
- Persona label prominent in interview header + status panel (misclick mitigation).
- "Switch persona" link on every onboarding screen:
  - Calls `abandonInterviewAction(currentInterviewId)` — marks `abandoned`. FK is now `SET NULL` so artifacts survive.
  - Navigates to `/onboard`.
  - When user picks a new template, `claimOrphanedArtifactsAction` pulls the orphaned artifacts into the new interview.

#### Commit 4.c — Template switch smoke test

`scripts/test-persona-switch-artifact-retention.ts` — full scenario: pick ICP → ingest resume + LinkedIn → switch → pick job_search → artifacts reappear in new status panel.

### Phase 5 — ICP Review UI (synthesis + comparison)

#### Commit 5.a — `<ReviewIcp>` component + sections

Replaces Phase 1.e stub. Eight sections per SPEC-3's Review UI list, each its own file under `_components/review-sections/icp/`:

1. Declared ICP.
2. Inferred ICP from exemplars (hidden when positive-count is 0; labeled "declarative only").
3. Common patterns (hidden when positive-count < 3).
4. Meaningful variations (display-only, not written to rubric).
5. Exclusions / not ICP.
6. Disagreements (first-class visual treatment).
7. Search + scoring rubric preview.
8. Per-exemplar breakdown (collapsible, default collapsed).

Data from `orchestrator_state.dimensions` + `extracted` JSONB.

#### Commit 5.b — Disagreement detection

- `src/lib/onboarding/orchestrator/icp-disagreements.ts` — compares declared vs. inferred values per dimension, returns disagreement list with severity.
- Hooked into `<ReviewIcp>` section 6.

#### Commit 5.c — Exemplar-scarcity banner

Banner above ICP review when positive-exemplar count is 0, 1, or 2. Copy differs per count. Does not block confirm.

### Phase 6 — GTM post-confirm surface + sidebar

Post-confirm GTM experience. Mirrors SPEC-3's bet: the synthesized ICP rubric IS the product.

#### Commit 6.a — `<IcpDashboard>` component

- `src/app/(app)/_components/icp-dashboard.tsx` — renders:
  - Narrative ICP summary from `memory_documents.company_icp`.
  - Structured rubric from `user_scoring_profiles.icp_rubric` — firmographics / technographics / signals / disqualifiers / buyer personas as labeled sections.
  - Proof points from `memory_documents.icp_proof_points`.
  - Exemplars list (collapsible) — links back to `onboarding_artifacts` that fed the synthesis.
  - "Refresh ICP" button → `/onboard?mode=refresh&template=icp_definition`.
- Read-only in v1. Edits happen via refresh-mode onboarding.

#### Commit 6.b — Homepage branches on `user_type`

- `src/app/(app)/page.tsx` — reads `user_type`:
  - `'job_seeker'` → existing `<TodayClient>`.
  - `'gtm'` → `<IcpDashboard>`.
- `user_type` loaded in the RSC, no client cache drift.

#### Commit 6.c — Sidebar + empty-state vocabulary

- `src/components/sidebar-nav.tsx`: `NAV` becomes `buildNav(userType)`. GTM variant:
  - "Today" → "ICP" (same `/` route).
  - "History" — kept but empty for GTM v1 (no pipeline output yet).
  - "Watchlist" — unchanged semantics (companies of interest is persona-agnostic).
  - "Analytics" — hidden for GTM (nothing to analyze yet).
  - "Settings" — same.
- `src/components/app-shell.tsx` loads `user_type` and passes to `SidebarNav`.
- `/history` + `/analytics` GTM empty-state copy: "Automated discovery is coming. Your ICP rubric is the v1 asset — refresh it from the home screen."

#### Commit 6.d — `/settings` switch-persona placeholder

- `src/app/(app)/settings/_components/switch-persona-placeholder.tsx` — card showing current persona + "Switching personas is coming in a future update — contact support if you need to reset now." No destructive action in v1.
- Full reset infra (download-my-data + destructive delete) deferred to follow-up SPEC per `DEFERRED.md`.

## Verification

0. `npm run test:onboarding-confirm` — green through every commit (legacy path).
1. `npm run test:confirm-adapter` — 24/24.
2. `npm run test:onboarding-complete-per-template` (new) — green before and after Phase 1.c.
3. `npm run test:scoring-normalize-per-template` (new) — green before and after Phase 1.d.
4. `npm run test:icp-confirm` (new, Phase 3) — ICP confirm writes `company_icp` + `icp_rubric` + `profiles.user_type = 'gtm'`.
5. `npm run test:icp-confirm-low-exemplar` (new, Phase 3) — confidence clamp fires for 1–2 positive exemplars; confirm succeeds.
6. `npm run test:artifact-persistence` (new, Phase 4) — abandon + switch preserves artifact content.
7. `npm run test:persona-switch-artifact-retention` (new, Phase 4) — full browser-path regression against the CASCADE bug.
8. `npm run build` — strict typecheck passes through every commit.
9. **Happy job_search regression:** fresh user → `/onboard` → picks "For my job search" → artifact drop → agentic interview → review → confirm. DB: 5 `memory_documents` + 1 `pipeline_config` + 1 `user_scoring_profiles` + `onboarding_interviews.status='confirmed'` + `profiles.user_type='job_seeker'`. Lands on Today queue.
10. **Happy ICP path:** fresh user → `/onboard` → picks "For my company" → drops 5 positive + 1 negative + 2 buyer_persona + 1 company_context → agentic interview → synthesis review → confirm → lands on `<IcpDashboard>` showing the synthesized rubric.
11. **Persona misclick escape:** picks ICP → drops 1 artifact → clicks "switch persona" → chooser → picks job_search → the dropped artifact appears in the new status panel (CASCADE bug prevention) → interview completes on job_search data.
12. **Template switch pre-confirm:** pick ICP → artifact dropped → switch to job_search → verify `profiles.user_type` is still NULL.
13. **Existing-user backfill:** pre-SPEC-3 confirmed user loads `/onboard` → Commit 2.a migration already set `user_type='job_seeker'` → redirects to `/` without picker.
14. **Backfill edge case:** confirmed `onboarding_interviews` but no `pipeline_config` → Commit 2.c safety net writes `user_type` on next `/onboard` visit.
15. **Sidebar vocabulary:** `user_type='gtm'` user sees GTM nav ("ICP" instead of "Today", Analytics hidden); `user_type='job_seeker'` sees existing labels.
16. **GTM dashboard refresh:** click "Refresh ICP" → `/onboard?mode=refresh&template=icp_definition` opens agentic interview preloaded with existing ICP memory docs as context.
17. **Legacy `?legacy=1`:** still works, still writes `user_type='job_seeker'` at confirm.
18. **Refresh mode:** `?mode=refresh` on a confirmed user of either persona reloads the right template with existing memory docs as context.
19. **Exemplar-scarcity rule:** seed ICP interview with 0 / 1 / 2 / 3 / 5 positive exemplars; banner + section visibility match decision #7.

## Critical files

| Area                       | File                                                                      | Action                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Schema — unified extracted | `supabase/migrations/<stamp>_onboarding_extracted_unified.sql`            | New (Phase 1.a)                                                                                                   |
| Schema — dual persona      | `supabase/migrations/<stamp>_dual_persona_schema.sql`                     | New (Phase 2.a) — `user_type`, GTM columns, artifact FK relax, user backfill                                      |
| Schema — scoring ICP       | `supabase/migrations/<stamp>_scoring_profile_icp.sql`                     | New (Phase 2.b) — `icp_rubric jsonb`                                                                              |
| Types                      | `src/lib/supabase/types.ts`                                               | Extend `ProfileRow`, `OpportunityRow`, `OnboardingInterviewRow`, `UserScoringProfileRow`                          |
| Template types             | `src/lib/onboarding/templates/types.ts`                                   | Widen `InterviewTemplateId`; add `completionCheck`, `normalizeScoringProfile`, `userTypeOnConfirm`, `kindOptions` |
| Extraction generics        | `src/lib/onboarding/extraction.ts`                                        | Generic `runExtractionFromTranscript<X>`                                                                          |
| Completion check           | `src/lib/pipeline/onboarding.ts`                                          | Template-aware via `template.completionCheck`                                                                     |
| Scoring normalizer         | `src/lib/pipeline/scoring-profile.ts`                                     | Dispatcher; job-search logic moves into template                                                                  |
| Confirm logic              | `src/app/(app)/onboard/confirm-logic.ts`                                  | Reads unified `extracted`; writes `profiles.user_type` from `template.userTypeOnConfirm`                          |
| Interview actions          | `src/app/(app)/onboard/interview-actions.ts`                              | Dual-write `extracted`; dispatch adapter by template                                                              |
| ICP template               | `src/lib/onboarding/templates/icp-definition.ts`                          | New (Phase 3.a)                                                                                                   |
| ICP confirm adapter        | `src/lib/onboarding/orchestrator/to-confirm-edits.ts`                     | Add `toIcpConfirmEdits`                                                                                           |
| ICP disagreement engine    | `src/lib/onboarding/orchestrator/icp-disagreements.ts`                    | New (Phase 5.b)                                                                                                   |
| Artifact reassignment      | `src/lib/onboarding/artifacts/reassign.ts`                                | New (Phase 4.a)                                                                                                   |
| UI — onboard page          | `src/app/(app)/onboard/page.tsx`                                          | Read `user_type`; route to picker or template; backfill safety net                                                |
| UI — persona picker        | `src/app/(app)/onboard/_components/persona-picker.tsx`                    | New (Phase 4.b)                                                                                                   |
| UI — onboard router        | `src/app/(app)/onboard/_components/onboard-router.tsx`                    | Remove implicit job_search; accept resolved template                                                              |
| UI — review                | `src/app/(app)/onboard/_components/review-client.tsx`                     | Dispatch on `clientTemplate.id`                                                                                   |
| UI — job_search review     | `src/app/(app)/onboard/_components/review-sections/review-job-search.tsx` | New container                                                                                                     |
| UI — ICP review            | `src/app/(app)/onboard/_components/review-sections/icp/*.tsx`             | 8 new section files (Phase 5.a)                                                                                   |
| UI — artifact input        | `src/app/(app)/onboard/_components/artifact-input.tsx`                    | Template-driven `kind` options                                                                                    |
| UI — ICP dashboard         | `src/app/(app)/_components/icp-dashboard.tsx`                             | New (Phase 6.a)                                                                                                   |
| UI — homepage              | `src/app/(app)/page.tsx`                                                  | Branch on `user_type` (Phase 6.b)                                                                                 |
| UI — sidebar               | `src/components/sidebar-nav.tsx`                                          | `buildNav(userType)` (Phase 6.c)                                                                                  |
| UI — app shell             | `src/components/app-shell.tsx`                                            | Load + pass `user_type`                                                                                           |
| UI — settings placeholder  | `src/app/(app)/settings/_components/switch-persona-placeholder.tsx`       | New (Phase 6.d)                                                                                                   |
| Tests                      | `scripts/test-*`                                                          | 7 new / extended scripts                                                                                          |

## Reused primitives

- `performConfirm(svc, userId, interviewId, edits)` — SPEC-2's confirm seam. Extended to write `user_type`.
- `generateObject` + template-owned zod schemas — orchestrator + extraction via AI SDK v6 Anthropic provider.
- `toClientTemplate()` — extended with `kindOptions` + `userTypeOnConfirm`.
- `getOrCreateInterviewAction(isRefresh, templateId)` — already parameterized; `InterviewTemplateId` widened.
- `startAgenticInterviewAction(interviewId)` — works for both templates, no change.
- Artifact ingestion (`/api/onboard/artifacts`, `artifacts/ingest.ts`) — persona-agnostic mechanics; template-specific interpretation via system prompt.
- `EmptyState`, `PageHeader`, `DetailHeader`, `<Alert>` — existing primitives; vocabulary via props.

## Risks

- **Broken-hallway risk.** The GTM post-confirm surface is a static ICP dashboard. If users expect a pipeline and don't find one, the `<IcpDashboard>` has to stand on its own. Mitigated by making the dashboard feel like the deliverable (operationalised rubric + exemplar provenance + "refresh" loop), not a placeholder. If users treat it as empty, that's the signal that Exa discovery (see `DEFERRED.md`) needs to ship next.
- **`extracted` dual-write drift.** Phase 1 dual-writes; cleanup deferred (tracked in `DEFERRED.md`). If a consumer is missed, one source of truth drifts. Mitigated by regression tests + the cleanup commit being scheduled after Phase 3 stabilises in prod.
- **`profiles.user_type` race at confirm.** Two tabs confirming two templates simultaneously (unlikely). Accept in v1; revisit if observed.
- **Artifact reassignment edge cases.** Abandon A → start B → abandon B → return to C: A's artifacts stay orphaned on abandon (`SET NULL`) and `claimOrphanedArtifactsAction(C)` pulls them in. Documented in Phase 4.a tests.
- **ICP dashboard freshness.** If a user's confirmed ICP goes stale (new customers, new disqualifiers), the only update path is refresh-mode onboarding. `DEFERRED.md` tracks "refresh-mode semantics for GTM" as an open product question.
- **Sidebar cache drift.** `user_type` loaded in RSC `(app)/layout.tsx` on every request — no client cache.
- **Persona misclick at review.** `user_type` hasn't been written (hard constraint). User loses interview minutes, not pipeline state. Persona label prominent throughout.
- **Exemplar scarcity UX.** 0/1/2-exemplar ICPs ship rubrics that may underperform. Banner + confidence clamp warn but don't block. If we see too many weak rubrics in prod, add a soft-block at confirm.
- **Copy testing.** "For my company" may alienate founder-solos. A/B test post-launch.

## Non-goals (SPEC-3 v1)

See `docs/DEFERRED.md` for the full deferred backlog. Summary of what does NOT ship in SPEC-3:

- Automated ICP discovery (Exa adapter).
- Manual GTM account entry + GTM scoring branch in `score.ts` + `OpportunityCard` GTM variant.
- `positioning_rubric` template + dashboard nudge.
- Full reset/export flow (placeholder only in v1).
- Multi-contact GTM accounts.
- Cross-persona substrate sharing.
- Archive tables for reset data.
- Dropping the 4 legacy `extracted_*` columns (deferred cleanup).
