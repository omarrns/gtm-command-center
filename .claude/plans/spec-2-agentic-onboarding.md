# SPEC-2 — Agentic onboarding (Orchestrator + Interviewer)

## Context

`docs/SPEC-2.md` specifies a two-agent onboarding flow: user drops artifacts (URL / text / file), an Orchestrator (Opus) ingests them and holds a per-dimension confidence map over the active template's rubric, and an Interviewer (Sonnet) only asks the user about dimensions below threshold. When every dimension crosses threshold, the existing `performConfirm` pathway writes memory docs + pipeline config + scoring profile.

This plan (1) evaluates whether a multi-agent framework should back this, (2) lays out a v1 build without one, and (3) incorporates review feedback tightening the data model, confirm adapter, and status-panel complexity.

Ships first against the `job_search` template — dogfooding the pattern on the live flow before widening to ICP/positioning. Phase 1 (template abstraction) is already live on `main`. The `InterviewTemplate` registry in `src/lib/onboarding/templates/` is the point of extension.

## Framework evaluation — stay on AI SDK v6, no framework adoption in v1

Two LLM calls per user turn, confidence state persisted in Supabase JSONB, and no live SSE for reasoning in v1. That's a DB-backed state machine with two model calls. Every candidate either duplicates AI SDK v6 or adds substrate without payoff at N=2 agents.

| Framework                        | Fit for SPEC-2                                                                                                                                                                                                | Verdict                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **AI SDK v6** (already in)       | `streamText` + `generateObject` + `tool()` cover everything. Anthropic provider wired.                                                                                                                        | **Use.**                                           |
| **Claude Agent SDK (TS)**        | Massive overlap with AI SDK v6. Vercel's own framing pitches CAS for "autonomous code agents / internal tools", not UI-facing chat.                                                                           | Skip.                                              |
| **Mastra** (v1.0, Jan 2026)      | TS-native, built-in memory, workflow graph, Vercel-first. Real. But recommended integration is "Mastra backend + AI SDK frontend" — our backend is already AI SDK. Substrate shift for 2 agents is premature. | Skip for v1.                                       |
| **CrewAI**                       | Python only.                                                                                                                                                                                                  | Skip.                                              |
| **LangGraph.js**                 | "Even simple two-agent flows require state schema, nodes, edges, and compilation." Overkill for a sequential per-turn loop.                                                                                   | Skip.                                              |
| **n8n**                          | Visual workflow automation, not an in-product agent runtime.                                                                                                                                                  | Skip.                                              |
| **Vercel Workflow DevKit (WDK)** | `DurableAgent` + `@workflow/ai` turn each LLM + tool call into a durable step with retries. Interesting only for artifact ingestion if it proves flaky. Irrelevant to the turn-based interview loop.          | **Conditional adopt for ingestion later.** Not v1. |

**Why this is right for this codebase specifically:**

- `.claude/CLAUDE.md` rule: "Extract after 3 repetitions, not 2. Premature abstraction is worse than duplication." Two agents is not the threshold.
- Orchestrator state is a Supabase JSONB column + a dedicated artifacts table — no framework's memory primitive simplifies that.
- Phase 1's `InterviewTemplate` abstraction is the native seam for per-template dimensions + thresholds. Re-expressing it through Mastra workflows throws away work.
- All candidates are <24 months old; Mastra hit v1.0 three months ago. "We used AI SDK and added a framework later" is additive. "We picked the wrong one" is a rewrite.

**Revisit triggers:** ≥3 concurrent agents per interview → LangGraph.js or Mastra. Artifact ingestion becomes long-running or crashes across deploys → WDK, ingestion step only. Cross-template memory becomes a scheduled job needing durability → WDK.

## Data model decision — dedicated `onboarding_artifacts` table

The spec ingests multiple artifacts per user (resume + LinkedIn URL + personal site + pasted text). `memory_documents` enforces `unique (user_id, document_key)` — a single key like `user_uploaded_artifacts` overwrites; one-key-per-kind (`user_resume`, `user_linkedin_raw`) breaks the moment we need 3+ artifacts of a kind (ICP template: 5 closed-won profiles).

**Two options considered:**

- **A. Dedicated `onboarding_artifacts` table.** One row per artifact. Per-artifact status, retry, delete. Clean provenance FK target. Handles ≥3 artifacts trivially. Cost: one migration + RLS.
- **B. Manifest in `orchestrator_state.artifacts` + canonical docs in `memory_documents`.** Fine for 1–2 artifacts. Awkward deletion (JSONB array mutation). Storing normalized markdown in JSONB hits row-size limits on long PDFs (50–200 KB each).

**Picking A.** Simpler query surface, cleaner delete affordance, trivial extension to future templates. Shape:

```sql
create table public.onboarding_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  interview_id uuid references public.onboarding_interviews(id) on delete cascade,
  kind text not null,          -- resume | linkedin | website | pasted_text | uploaded_file | other_url
  source_type text not null,   -- url | file | text
  source_label text,
  source_url text,
  file_name text,
  mime_type text,
  status text not null default 'pending',  -- pending | processing | succeeded | failed
  normalized_markdown text,
  error_message text,
  created_from_template_id text not null default 'job_search',  -- origin, not scope
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS policies mirror `memory_documents`. `created_from_template_id` records origin only — artifacts remain reusable across templates (an ICP run can re-use a resume ingested during job_search onboarding). Origin is separate from scope.

`memory_documents` still receives the durable confirm outputs (`user_profile`, `user_positioning`, etc.) — unchanged from Phase 1.

## `OrchestratorState` contract — define in Phase 1

Minimum shared state between orchestrator, interviewer, review UI, confirm adapter, and the status panel. Not a future-proof abstraction; the smallest shape that lets v1 agree on "what's inferred, what still needs asking, where each answer came from."

```ts
// src/lib/onboarding/orchestrator/types.ts
export type OrchestratorState = {
  version: 1;
  templateId: "job_search";
  status:
    | "empty"
    | "analyzing"
    | "interviewing"
    | "ready_for_review"
    | "failed";
  artifacts: Array<{
    id: string; // FK to onboarding_artifacts.id
    kind: string;
    sourceType: "url" | "file" | "text";
    sourceLabel?: string;
    sourceUrl?: string;
    status: "pending" | "processing" | "succeeded" | "failed";
    errorMessage?: string;
  }>;
  dimensions: Record<
    string,
    {
      value: unknown;
      summary: string; // one-line plain-English rationale, rendered in status panel
      confidence: number; // 0–1
      threshold: number; // per-dimension cutoff
      status:
        | "unknown"
        | "inferred"
        | "needs_question"
        | "answered"
        | "confirmed";
      provenance: Array<{
        artifactId?: string;
        messageId?: string;
        sourceLabel: string;
        quote?: string;
        note?: string;
      }>;
      updatedAt: string;
    }
  >;
  activeDimensionKey: string | null; // the dimension currently being asked — what the user's next message will be attributed to
  nextDimensionKey: string | null; // cached result of nextDimensionToAsk() for UI
  askedDimensionKeys: string[];
  metrics: {
    questionCount: number;
    artifactSuccessCount: number;
    artifactFailureCount: number;
    reviewEdits: Array<{
      dimensionKey: string;
      previousValue: unknown;
      editedValue: unknown;
      previousConfidence: number;
    }>;
  };
};
```

Stored in `onboarding_interviews.orchestrator_state jsonb`. The artifact manifest here duplicates `onboarding_artifacts` rows by design — the table is the source of truth for artifact content; `orchestrator_state.artifacts` is the fast-read snapshot for UI rendering without joins.

**Turn-loop contract** (why `activeDimensionKey` matters): the `/api/onboard/chat` endpoint fires _on_ a user message, which is the answer to whatever was last asked. Without persisting which dimension that was, the orchestrator cannot attribute the incoming answer. `activeDimensionKey` is set when the interviewer asks a dimension, consumed when the next user message arrives, then cleared and replaced with the newly-chosen next dimension.

## v1 build plan — phases

### Phase 0 — Regression guardrails

Green on `main` before anything else. SPEC-2 changes the chat endpoint, review UX, adds ingestion endpoints — risk surface bigger than Phase 1.

- Extend `scripts/test-onboarding-confirm.ts`: assert legacy `/api/onboard/chat` → extract → review path stays green when `template.agenticMode === false`. Agentic path ships behind a template flag so legacy path cannot regress.
- Add `scripts/test-confirm-adapter.ts`: asserts `toJobSearchConfirmEdits(orchestratorState, userEdits)` → `performConfirm` writes the same memory docs / pipeline_config / scoring_profile shape as the legacy path.

Both run on every commit touching `templates/`, `orchestrator/`, `artifacts/`, or `confirm-logic.ts`.

### Phase 1 — Schema + contracts

- **Migration `supabase/migrations/<stamp>_agentic_onboarding.sql`:** adds `onboarding_interviews.orchestrator_state jsonb` + creates `onboarding_artifacts` table + RLS.
- **`src/lib/onboarding/orchestrator/types.ts`:** defines `OrchestratorState` per the contract above.
- **`src/lib/onboarding/templates/types.ts`:** adds `agenticMode: boolean`, `dimensions: Dimension[]` (`{ key, description, confidenceThreshold }`), `rubricSchema: z.ZodType`, `orchestratorModel`, `orchestratorSystemPrompt(ctx)`, `interviewerSystemPrompt(ctx, nextDimension)`. Extends `ClientInterviewTemplate` with `agenticMode` + `dimensions: Array<{ key, label }>`.
- **`src/lib/supabase/types.ts`:** adds `orchestrator_state` to `OnboardingInterviewRow`; adds `OnboardingArtifactRow`.

### Phase 2 — Artifact ingestion (best-effort with fallback)

Supported inputs: URL (LinkedIn, resume URL, personal site, portfolio, any URL), freeform text paste, file upload (PDF first; docx if dep cost is acceptable).

**Stance:** URL scraping is **best-effort convenience, not a hard dependency.** LinkedIn especially is unreliable (auth, JS rendering, anti-scraping). Failure must not silently skip and must not permanently block — user can paste text or upload a file for the same artifact kind and continue.

- **`src/lib/onboarding/artifacts/ingest.ts`** (new):
  - `ingestUrl(url)` → Firecrawl `/scrape` → markdown. On failure: persist artifact row with `status='failed'` + actionable `error_message`.
  - `ingestText(text)` → passthrough normalization.
  - `ingestFile(buffer, mime)` → PDF via `unpdf` (edge-compat), docx via `mammoth` (optional).
  - Every successful ingest writes an `onboarding_artifacts` row with `status='succeeded'` + `normalized_markdown` + syncs a manifest entry into `orchestrator_state.artifacts`.
- **Route `src/app/api/onboard/artifacts/route.ts`** (new): `POST` accepts URL, text, or file. Returns persisted artifact metadata. Never silent-skips.
- **Fallback UX contract:** status panel shows per-artifact result ("LinkedIn URL: failed, paste text instead"). Interview is allowed to proceed once ≥1 artifact succeeds OR the user explicitly chooses to continue without artifacts (fully manual legacy-shape interview, agentic orchestrator receives no inferences).

### Phase 3 — Orchestrator core (no live stream)

- **`src/lib/onboarding/orchestrator/run.ts`** (new):
  - `analyzeArtifacts(interviewId, svc)`: after each artifact lands. Reads all succeeded artifact rows, calls Opus via `generateObject` against `template.rubricSchema` + confidence map schema, writes result to `orchestrator_state`. Populates `dimensions[k].summary` with a one-line plain-English rationale (no raw CoT).
  - `updateDimensionFromAnswer(interviewId, dimensionKey, userAnswer, svc)`: after each interviewer turn. Opus call narrowed to the target dimension. Updates confidence + provenance.
  - `nextDimensionToAsk(state)`: pure function. Returns lowest-confidence dimension below threshold, or `null` if done.
- **No `/api/onboard/orchestrator/stream` route in v1.** Status panel renders from saved `orchestrator_state` and refreshes after artifact ingest and after each chat turn. If live testing shows this feels flat, adding a stream is additive.

### Phase 4 — Interviewer branch

- **Modify `src/app/api/onboard/chat/route.ts`:**
  - `agenticMode === true`, per invocation (the endpoint fires on user message):
    1. If `state.activeDimensionKey` is set, the incoming user message is the answer — call `updateDimensionFromAnswer(state.activeDimensionKey, userMessage)`.
    2. Compute `nextDimensionToAsk(state)`. If `null`, emit `template.completionMarker`, clear `activeDimensionKey`, set `status='ready_for_review'`, advance to `review`.
    3. Otherwise set `activeDimensionKey = nextKey`, append to `askedDimensionKeys`, build interviewer system prompt with the dimension + orchestrator's current hypothesis, call `streamText`, increment `metrics.questionCount`.
  - First turn special case: `activeDimensionKey` starts `null` after artifact analysis; step 1 is skipped and the interviewer asks the first low-confidence dimension.
  - `agenticMode === false`: existing code path unchanged (legacy wrap-up heuristic, `maxAssistantMessages`).
- Interviewer stays on `template.chatModel` (Sonnet). Orchestrator uses new `template.orchestratorModel` (Opus). Both via existing `@ai-sdk/anthropic`.

### Phase 5 — Confirm adapter

- **`src/lib/onboarding/orchestrator/to-confirm-edits.ts`** (new):
  - `toJobSearchConfirmEdits(state, userReviewEdits): JobSearchEdits` — maps `orchestrator_state.dimensions` + any inline review-screen edits onto the legacy `JobSearchEdits` shape that `performConfirm` already consumes.
  - Preserves the proven confirm pipeline: memory docs, pipeline config, scoring profile normalization. No rewrite of `performConfirm`.
- **`src/app/(app)/onboard/interview-actions.ts`:** the agentic branch of the confirm server action calls `toJobSearchConfirmEdits` then delegates to existing `performConfirm(svc, userId, interviewId, edits)`. Legacy branch untouched.
- **`src/app/(app)/onboard/confirm-logic.ts`:** ideally no change. If `performConfirm` needs a minor signature tweak to accept an `editsSource: "legacy" | "agentic"` tag for metric separation, keep the tweak surgical.

Pseudo-flow:

```
agentic review edits
  → merge with orchestrator_state.dimensions
  → toJobSearchConfirmEdits(...)
  → performConfirm(svc, userId, interviewId, edits)
```

### Phase 6 — UI

- **`src/app/(app)/onboard/_components/artifact-input.tsx`** (new): URL paste + textarea + file input. Per-artifact status chips. Fallback UX for failed URL scrapes ("LinkedIn URL didn't work — paste text or upload PDF instead"). Explicit "continue without artifacts" escape hatch.
- **`src/app/(app)/onboard/_components/orchestrator-status-panel.tsx`** (new): right-side panel, driven by saved `orchestrator_state`. Renders:
  - Read: per-artifact status (succeeded / failed + reason).
  - Inferred: per-dimension value + confidence chip + `summary` one-liner.
  - Still need: dimensions with `status: "needs_question"`.
  - No raw chain-of-thought. No `sendReasoning: true`.
- **Modify `src/app/(app)/onboard/_components/interview-client.tsx`:** when `clientTemplate.agenticMode`, mount `ArtifactInput` before chat opens + `OrchestratorStatusPanel` alongside chat. Polls/refreshes state after each turn.
- **Modify `src/app/(app)/onboard/_components/review-client.tsx`:** provenance rendering. Each field: value + `Source` affordance (click expands quoted artifact span or interview turn). Provenance comes from `orchestrator_state.dimensions[k].provenance`. Default collapsed; auto-expands for borderline-confidence fields.

### Phase 7 — Wire `job_search` into agentic mode + verification

`src/lib/onboarding/templates/job-search.ts`:

- Set `agenticMode: true`.
- Populate `dimensions` from the existing 7 topic keys. Default threshold 0.75.
- Add `orchestratorSystemPrompt(ctx)` and `interviewerSystemPrompt(ctx, nextDimension)`.
- Add `rubricSchema` (zod) — the live dimension-values schema.

Flip default `/onboard` to agentic path. Legacy reachable via `?legacy=1` for a release window.

## Verification

0. `npm run test:onboarding-confirm` — green through every commit (legacy path).
1. `npm run test:confirm-adapter` (new) — `toJobSearchConfirmEdits` produces bit-identical confirm effects to a legacy `JobSearchEdits` input.
2. **Happy path:** fresh user → `/onboard` → paste resume URL + LinkedIn + personal site → status panel shows ingestion results + per-dimension inference → interviewer asks 3–5 non-obvious questions → review shows provenance → confirm → DB: expected 5 `memory_documents` + ≥1 `onboarding_artifacts` rows + `pipeline_config` + `user_scoring_profiles` + `onboarding_interviews.status='confirmed'`.
3. **LinkedIn scrape failure fallback:** paste invalid / gated LinkedIn URL → artifact row marked `failed` with actionable error → user pastes LinkedIn text → ingestion succeeds → interview proceeds normally.
4. **PDF-only path:** upload resume PDF → orchestrator produces inferences → interview completes.
5. **Text-only path:** paste resume text → interview completes.
6. **Zero-artifact path:** user clicks "continue without artifacts" → orchestrator state stays `analyzing` → interviewer falls back to legacy-shape question sequence (orchestrator makes no inferences, asks each dimension directly).
7. **Legacy regression:** `/onboard?legacy=1` runs the pre-SPEC-2 flow unchanged. Complete end-to-end.
8. **Refresh mode:** `/onboard?mode=refresh` on a confirmed user — orchestrator reads existing artifact rows without re-upload.
9. `npm run build` — strict typecheck passes with new fields.

## Critical files

| Area                 | File                                                                               | Action                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema               | `supabase/migrations/<stamp>_agentic_onboarding.sql`                               | New — `orchestrator_state jsonb` + `onboarding_artifacts` table + RLS                                                                                         |
| Types — orchestrator | `src/lib/onboarding/orchestrator/types.ts`                                         | New — `OrchestratorState`, dimension types                                                                                                                    |
| Types — template     | `src/lib/onboarding/templates/types.ts`                                            | Add `agenticMode`, `dimensions`, `rubricSchema`, `orchestratorModel`, `orchestratorSystemPrompt`, `interviewerSystemPrompt`; extend `ClientInterviewTemplate` |
| Types — DB           | `src/lib/supabase/types.ts`                                                        | Add `orchestrator_state` to `OnboardingInterviewRow`; add `OnboardingArtifactRow`                                                                             |
| Artifact ingestion   | `src/lib/onboarding/artifacts/ingest.ts`, `src/app/api/onboard/artifacts/route.ts` | New                                                                                                                                                           |
| Orchestrator         | `src/lib/onboarding/orchestrator/run.ts`                                           | New (no stream route in v1)                                                                                                                                   |
| Confirm adapter      | `src/lib/onboarding/orchestrator/to-confirm-edits.ts`                              | New — maps `OrchestratorState` → `JobSearchEdits`                                                                                                             |
| Interviewer          | `src/app/api/onboard/chat/route.ts`                                                | Branch on `agenticMode`                                                                                                                                       |
| Confirm              | `src/app/(app)/onboard/interview-actions.ts`                                       | Agentic branch calls adapter then `performConfirm`                                                                                                            |
| Confirm              | `src/app/(app)/onboard/confirm-logic.ts`                                           | No change ideally; surgical tweak only if metric/source tag required                                                                                          |
| UI — artifacts       | `src/app/(app)/onboard/_components/artifact-input.tsx`                             | New                                                                                                                                                           |
| UI — status          | `src/app/(app)/onboard/_components/orchestrator-status-panel.tsx`                  | New — driven by saved state, no SSE                                                                                                                           |
| UI — interview       | `src/app/(app)/onboard/_components/interview-client.tsx`                           | Mount artifact input + status panel in agentic mode                                                                                                           |
| UI — review          | `src/app/(app)/onboard/_components/review-client.tsx`                              | Provenance rendering                                                                                                                                          |
| Job-search template  | `src/lib/onboarding/templates/job-search.ts`                                       | `agenticMode: true`, dimensions, rubricSchema, orchestrator + interviewer prompts                                                                             |
| Tests                | `scripts/test-onboarding-confirm.ts`, `scripts/test-confirm-adapter.ts`            | Extend / new                                                                                                                                                  |

## Reused primitives

- `generateObject` + zod pattern from `src/lib/onboarding/extraction.ts`. Orchestrator uses the same discipline against a rubric + confidence schema.
- `@ai-sdk/anthropic` provider; `streamText` for interviewer.
- `performConfirm(svc, userId, interviewId, edits)` at `src/app/(app)/onboard/confirm-logic.ts` — proven confirm pipeline reused via adapter.
- `toClientTemplate` projector — extend to project `agenticMode` + `dimensions`.
- Firecrawl — already documented, no new dep for URL ingestion.
- `memory_documents` upsert pattern from `confirm-logic.ts` — confirm outputs unchanged.

## Internal metrics (lightweight, not user-facing)

Tracked inside `orchestrator_state.metrics` + per-dimension status + per-artifact status. Point is to calibrate confidence thresholds and question selection, and to monitor scraping reliability — not build an analytics system.

- `artifacts.*.status` — per-artifact success/failure (from `onboarding_artifacts`).
- `metrics.questionCount` — total interviewer turns.
- `askedDimensionKeys` — which dimensions the interviewer surfaced to the user.
- `metrics.reviewEdits` — populated at confirm time. One entry per field the user edited on the review screen: `{ dimensionKey, previousValue, editedValue, previousConfidence }`. Written by the confirm adapter before `performConfirm` runs; no schema change required, lives inside `orchestrator_state`.
- Time from first artifact submitted to `status='ready_for_review'`.

Answers: are users still being asked too many questions? is the orchestrator overconfident? which scraping paths fail most? which inferred fields do users frequently correct?

## Risks

- **Orchestrator overconfidence** — confirm-step edit rate is the first-class calibration metric (recorded per above). Thresholds manual per-template until enough data exists to auto-tune.
- **Two-model cost** — Opus + Sonnet per interview. Orchestrator analysis runs on artifact-land and on each user answer, not per interviewer token.
- **Status panel feels flat** — if saved-state refresh lacks perceived intelligence in live testing, adding the SSE stream is an additive change post-launch. Not v1.
- **LinkedIn / URL scrape reliability** — treated as best-effort. Failed scrape never blocks; UI routes user to text/file fallback. Per-artifact `status` + `error_message` exposed in status panel.
- **Legacy flag rot** — `agenticMode: false` path must stay green until job_search agentic is proven in prod. Calendar a flag removal two releases after rollout.
- **Artifact privacy** — raw resume + scraped LinkedIn markdown in `onboarding_artifacts`. Delete affordance in `/settings` before rollout; cascade delete on user removal.
