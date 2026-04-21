# Phase 1 — Template Abstraction Refactor (job_search only)

## Context

`docs/build-spec-gtm-command-center-pivot.md` generalizes the onboarding interview from a single job-search flow into a multi-template platform (job_search, icp_definition, positioning_rubric). **Phase 1 is pure refactor**: extract the existing job_search flow into a reusable `InterviewTemplate` shape. Zero behavior change. The goal is to prove the abstraction holds before templates #2 and #3 add pressure on it.

Current state machine, CAS locks, streaming loop, completion detection, and confirm flow (documented in `docs/onboarding-architecture.md`) are preserved unchanged. Only template-specific knobs (topics, prompts, schema, outputs) move from hardcodings into data.

## Phase 0 — Regression guardrail (do this first)

Before touching any code, write one DB-integration test that captures the current job_search happy path through the confirm stage. The confirm stage is the hot zone of the refactor (6-step hardcoded sequence → `for (output of template.outputs)` loop). If anything breaks, this test surfaces it immediately.

**Create `scripts/test-onboarding-confirm.ts`:**

1. Resolve a test user (existing pattern from `scripts/onboard-fixture.ts:28-35`: use `SEED_USER_ID` env var or look up `omarns059@gmail.com`). Reset onboarding rows for that user (same reset helper at `onboard-fixture.ts:230-244`).
2. Seed a `review`-status `onboarding_interviews` row with the existing transcript + `extracted_*` fixtures from `scripts/onboard-fixture.ts:64-228`. This is basically `seedInterview(userId, "review")` extracted into a helper or called directly.
3. Import `confirmInterviewAction` and invoke it — but wait: it calls `requireUser()` which reads from cookies. Either (a) refactor `confirmInterviewAction` to accept an optional `user` override for testability, or (b) write the test to call the underlying persistence logic directly, bypassing the auth wrapper. Option (b) is lower-risk — duplicate the handful of `svc.from(...).upsert(...)` calls inline in the test, using the same `ConfirmEdits` payload. After the refactor, the inline calls get replaced with the template-driven equivalent and the assertions stay unchanged.

   Recommended: write the test to exercise `confirmInterviewAction` directly via a small shim that bypasses `requireUser` — e.g. split the body into an exported `performConfirm(svc, userId, interviewId, edits)` and keep the server-action wrapper that calls `requireUser()` then delegates. The refactor then replaces `performConfirm`'s body; the test exercises it unchanged. This split is trivial and reusable as a test seam for Phase 2+.

4. Assert:
   - 5 `memory_documents` rows exist for the user with keys `user_profile`, `user_positioning`, `user_dealbreakers`, `feedback_outreach_style`, `interview_insights`. Each has non-empty `content`.
   - `memory_documents[user_profile].content` contains `## Positioning`, `## Career Highlights`, `## Top Proof Points` markdown sections.
   - `memory_documents[feedback_outreach_style].content` starts with `## Outreach Tone` and includes the tone label (Casual/Direct/Formal).
   - 1 `pipeline_config` row with `score_threshold=70`, `daily_send_cap=10`, `search_queries=["GTM Engineer","Growth Engineer"]`, `search_locations=["San Francisco","Remote"]` (from the fixture).
   - 1 `user_scoring_profiles` row with non-empty `target_roles` and `preferred_stages` (proves `normalizeScoringProfile` ran).
   - `onboarding_interviews.status = 'confirmed'`.
5. Run the confirm action a **second time** and assert no duplicate rows appear — idempotency check. This matches the existing contract (every step is an `upsert`).

Add `"test:onboarding-confirm": "tsx scripts/test-onboarding-confirm.ts"` to `package.json` scripts.

**Commit `performConfirm` split + test BEFORE any template work.** Run the test green on current `main`. Then run it after every meaningful refactor commit (template types, migration, route.ts, interview-actions.ts rewire). Green on both sides = behavior preserved.

Also keep existing guardrails running:

- `npm run test:extraction` — real Opus call, covers the extraction shape. Already exists. Passing pre-refactor is a prerequisite.
- `npm run test:sender-identity` — contract test for related code. Unchanged by this refactor, but catches collateral damage.

## Non-goals (explicit)

- No new templates. Registry holds only `job_search`.
- No unified `extracted` JSONB column — keep the existing 4 `extracted_*` columns. Phase 2 adds unified storage when a second schema demands it.
- No changes to `ReviewClient` rendering — only accepts a template prop; fields stay job_search-shaped.
- No changes to `normalizeScoringProfile` internals or `isOnboardingComplete`. Both are job_search-specific by construction; revisit when template #2 lands.
- No changes to the manual wizard (`onboard-client.tsx`) or review-sections sub-components.
- No deletion of `interview-prompt.ts` / `extraction.ts` / `extraction-prompt.ts` — they become thin re-export shims so the diff stays reviewable. Follow-up can delete them once Phase 1 is verified in prod.

## File layout

**Create:**

- `src/lib/onboarding/templates/types.ts` — `InterviewTemplate`, `OutputMapping`, `InterviewPromptContext`, `ClientInterviewTemplate`, `InterviewTemplateId`
- `src/lib/onboarding/templates/job-search.ts` — `JOB_SEARCH_TEMPLATE` instance (inlines prompt function, tool, topics, extraction schema, extraction prompt reference, edits schema, outputs array and their transforms)
- `src/lib/onboarding/templates/index.ts` — `getTemplate(id)` / `getDefaultTemplate()` / `toClientTemplate(template)` projector
- `supabase/migrations/20260420000001_interview_template_id.sql`

**Modify:**

- `src/app/api/onboard/chat/route.ts` — template-load + 7 hardcoded knobs swapped
- `src/app/(app)/onboard/interview-actions.ts` — template-load in extract + confirm; 6-step block → `for (output of template.outputs)` loop; `getOrCreateInterviewAction` accepts `templateId`
- `src/lib/onboarding/extraction.ts` — `runExtractionFromTranscript(messages, template)`
- `src/app/(app)/onboard/_components/onboard-router.tsx` — reads `interview.template_id`, passes `ClientInterviewTemplate` down
- `src/app/(app)/onboard/_components/interview-client.tsx` — consumes template prop for topics/labels/opening text (removes the duplicate opening strings at lines 54-74)
- `src/app/(app)/onboard/_components/review-client.tsx` — accepts template prop (unused for render in Phase 1, wired for Phase 2)
- `src/app/(app)/onboard/page.tsx` — selects default template when passing to router
- `src/lib/supabase/types.ts` — adds `template_id` + `template_version` to `OnboardingInterviewRow`
- `scripts/onboard-fixture.ts` — insert with `template_id = 'job_search'`, `template_version = 'v1'`
- `scripts/test-extraction.ts` — pass `JOB_SEARCH_TEMPLATE` into extraction call
- `scripts/test-onboarding-confirm.ts` (NEW — see Phase 0 above) — confirm-path regression test
- `package.json` scripts — add `test:onboarding-confirm`

**Keep as thin re-export shim (to minimize call-site churn):**

- `src/lib/onboarding/interview-prompt.ts` — re-exports `INTERVIEW_TOPICS`, `InterviewTopic`, `interviewTools`, `buildInterviewPrompt`, `OPENING_MESSAGE`, `REFRESH_OPENING_MESSAGE` pointing at `JOB_SEARCH_TEMPLATE`
- `src/lib/onboarding/extraction-prompt.ts` — keep `EXTRACTION_SYSTEM_PROMPT` constant; imported by `job-search.ts`

## Template interface shape

```ts
// src/lib/onboarding/templates/types.ts
export type InterviewTemplateId = "job_search";

export interface InterviewPromptContext {
  isRefresh: boolean;
  existingProfile?: string;
}

export interface OutputMapping<E = unknown, X = unknown> {
  type: "memory_doc" | "pipeline_config" | "scoring_profile_normalize";
  key?: string; // memory_doc only: document_key
  title?: string; // memory_doc only: memory_documents.title
  transform: (args: {
    edits: E;
    extraction: X | null;
  }) => Record<string, unknown> | string | null; // null = skip
}

export interface InterviewTemplate<E = unknown, X = unknown> {
  id: InterviewTemplateId;
  version: string; // "v1" (spec section 5)

  // Chat phase
  systemPrompt: (ctx: InterviewPromptContext) => string;
  tools: ToolSet; // { report_topics: tool({...}) }
  openingMessage: string;
  refreshOpeningMessage: string;
  maxAssistantMessages: number; // 12
  wrapUpThreshold: number; // 10 (cap - 2)
  completionMarker: string; // "[INTERVIEW_COMPLETE]"
  completionTopicThreshold: number; // 5
  chatModel: string; // "claude-sonnet-4-6"
  chatMaxOutputTokens: number; // 1024

  // Topic tracking
  topics: readonly string[]; // job_search's 7 topics
  topicLabels: Record<string, string>; // display labels

  // Extraction phase
  extractionSchema: z.ZodType<X>;
  extractionSystemPrompt: string;
  extractionModel: string; // "claude-opus-4-6"
  extractionMaxOutputTokens: number; // 4096

  // Confirm phase
  editsSchema: z.ZodType<E>; // validates ConfirmEdits input
  outputs: readonly OutputMapping<E, X>[];
}

// Client-safe projection — strips non-serializable fields (zod, tools, function)
export interface ClientInterviewTemplate {
  id: InterviewTemplateId;
  topics: readonly string[];
  topicLabels: Record<string, string>;
  openingMessage: string;
  refreshOpeningMessage: string;
}
```

**`systemPrompt` is a function, not a string** — the spec says `string`, but the current `buildInterviewPrompt({ isRefresh, existingProfile })` takes runtime context (the existing profile loaded per-request in `route.ts:63-67`). A function is a strict superset of a string; ICP/positioning templates that don't need refresh mode can `() => STATIC_STRING`.

**`toClientTemplate()` is required** — passing a raw `InterviewTemplate` across the RSC→Client boundary fails because `systemPrompt` is a function and `tools`/`extractionSchema`/`editsSchema` are zod instances. The projector returns only the 5 JSON-serializable fields that client components actually use.

## Database migration

`supabase/migrations/20260420000001_interview_template_id.sql`:

```sql
BEGIN;

ALTER TABLE public.onboarding_interviews
  ADD COLUMN template_id text NOT NULL DEFAULT 'job_search',
  ADD COLUMN template_version text NOT NULL DEFAULT 'v1';

-- Replace active-interview uniqueness with per-template scope.
-- Create-new-then-drop-old in a single TX so no INSERT window runs unguarded.
CREATE UNIQUE INDEX onboarding_interviews_active_template_idx
  ON public.onboarding_interviews (user_id, template_id)
  WHERE status IN ('in_progress', 'extracting', 'review');

DROP INDEX IF EXISTS public.onboarding_interviews_active_idx;

COMMIT;
```

No `CHECK (template_id IN ('job_search'))` constraint — the registry lookup in `getTemplate(id)` enforces validity at the application layer. Keeps Phase 2 from needing a migration just to lift a constraint.

Existing rows get `template_id='job_search'`, `template_version='v1'` via column defaults. The old index's semantics (one active per user) are a strict subset of the new (one active per user per template) when only one template exists, so no data conflict.

## Integration edits

**1. `src/app/api/onboard/chat/route.ts`**

- Add `template_id, template_version` to the `SELECT` at line 32.
- After status check, `const template = getTemplate(interview.template_id)`.
- Line 45: `const MAX_ASSISTANT_MESSAGES = template.maxAssistantMessages;`
- Lines 69-72: `systemPrompt = template.systemPrompt({ isRefresh, existingProfile })`
- Line 75 gate: `if (assistantCount >= template.wrapUpThreshold)`
- Line 80: `model: anthropic(template.chatModel)`, `tools: template.tools`, `maxOutputTokens: template.chatMaxOutputTokens`
- Line 124: `lastText.includes(template.completionMarker)`
- Line 132: `topicSet.size >= template.completionTopicThreshold`
- The literal `"report_topics"` in `getToolName(part) === "report_topics"` at line 98 stays as-is — the tool name is a stable contract across templates (every template declares its topic-reporting tool under that name), not a template knob.

**2. `src/app/(app)/onboard/interview-actions.ts`**

- `getOrCreateInterviewAction(isRefresh, templateId: InterviewTemplateId = "job_search")`. The existing-active `SELECT` at line 54 adds `.eq("template_id", templateId)` so the per-template partial unique index is respected. `INSERT` adds `template_id`, `template_version: getTemplate(templateId).version`.
- `extractAndReviewAction` (line 106): after ownership check, `const template = getTemplate(interview.template_id)`. Call `runExtractionFromTranscript(messages, template)`. Keep writing the 4 columns `extracted_profile/search/outreach/insights` — the job_search schema decomposes into exactly those 4 top-level keys.
- **Split the confirm body into `performConfirm(svc, userId, interviewId, edits)` (exported, testable) and keep `confirmInterviewAction` as a thin wrapper that calls `requireUser()` + delegates.** The Phase 0 test exercises `performConfirm` directly. The refactor below replaces `performConfirm`'s body.
- `confirmInterviewAction` (line 220):
  - `const template = getTemplate(interview.template_id)`
  - `const parsedEdits = template.editsSchema.parse(edits)` — validate at the trust boundary.
  - Reassemble `const extraction = { profile: interview.extracted_profile, search: interview.extracted_search, outreach: interview.extracted_outreach, insights: interview.extracted_insights }`.
  - Replace the 6-step block (lines 245-385) with:
    ```ts
    for (const output of template.outputs) {
      const payload = output.transform({ edits: parsedEdits, extraction });
      if (payload === null) continue;
      switch (output.type) {
        case "memory_doc":
          await upsertMemoryDoc(
            svc,
            user.id,
            output.key!,
            output.title!,
            payload as string,
          );
          break;
        case "pipeline_config":
          await upsertPipelineConfig(svc, user.id, payload as object);
          break;
        case "scoring_profile_normalize":
          await normalizeScoringProfile(svc, user.id);
          break;
      }
    }
    // Final status flip (unchanged from lines 378-384)
    ```
  - Helpers `upsertMemoryDoc` / `upsertPipelineConfig` live in the same file or a sibling `interview-persistence.ts`. Each throws on DB error, so the catch at line 389 still reverts cleanly (interview stays in `review` for retry).
  - The `formatInsightsAsMarkdown` helper at line 446 **moves into `job-search.ts`** as the `interview_insights` output's `transform`.

**3. `src/lib/onboarding/extraction.ts`**

- Change signature to `runExtractionFromTranscript(messages: UIMessage[], template: InterviewTemplate): Promise<unknown>`.
- Replace hardcoded model / schema / system prompt / maxTokens with `template.extractionModel` / `template.extractionSchema` / `template.extractionSystemPrompt` / `template.extractionMaxOutputTokens`.
- Keep `ExtractionProfile`, `ExtractionSearch`, `ExtractionOutreach`, `ExtractionInsights`, `ExtractionResult` type aliases as re-exports from `JOB_SEARCH_TEMPLATE`'s zod types so `review-client.tsx:14-18` continues to compile.

**4. `src/app/(app)/onboard/_components/onboard-router.tsx`**

- No new UI affordance (single template). Add a `clientTemplate: ClientInterviewTemplate` prop.
- Pass `clientTemplate` to `InterviewClient` at line 113 and to `ReviewClient` at line 95.
- The existing `getOrCreateInterviewAction(isRefresh)` call at line 144 works unchanged (templateId defaults to `"job_search"`).

**5. `src/app/(app)/onboard/page.tsx`**

- Compute `const clientTemplate = toClientTemplate(getDefaultTemplate())`. Pass to `<OnboardRouter>`.

**6. `src/app/(app)/onboard/_components/interview-client.tsx`**

- Accept `clientTemplate: ClientInterviewTemplate` prop.
- Replace imports at lines 29-31 with reads from the prop (`clientTemplate.topics`, `clientTemplate.topicLabels` instead of `INTERVIEW_TOPICS` / `TOPIC_LABELS`).
- Delete the duplicated `OPENING_MESSAGE` / `REFRESH_OPENING_MESSAGE` constants at lines 54-74. Build the opening message inline: `{ id: "opening", role: "assistant", parts: [{ type: "text", text: interview.is_refresh ? clientTemplate.refreshOpeningMessage : clientTemplate.openingMessage }] }`.
- This dedupes the two copies of the opening text (was in both `interview-prompt.ts` and `interview-client.tsx`). Single source: `JOB_SEARCH_TEMPLATE.openingMessage`.

**7. `src/app/(app)/onboard/_components/review-client.tsx`**

- Accept `clientTemplate: ClientInterviewTemplate` prop. Don't use it yet in Phase 1 — all render logic stays. Prop exists so Phase 2 can switch on `clientTemplate.id` without a fresh signature change.

**8. `src/lib/supabase/types.ts` line 228**

- Add `template_id: InterviewTemplateId; template_version: string;` to `OnboardingInterviewRow`.

## Reused functions / modules (do not reinvent)

- `requireUser()`, `createSupabaseServiceClient()` — `src/lib/supabase/server.ts`, `src/lib/supabase/service.ts`
- `loadMemoryContext(userId, svc)`, `formatMemoryForPrompt(ctx)` — `src/lib/skills/context.ts` (used by route.ts for refresh mode)
- `normalizeScoringProfile(svc, userId)` — `src/lib/pipeline/scoring-profile.ts` (called by job_search's `scoring_profile_normalize` output; internals unchanged)
- The existing `formatInsightsAsMarkdown` helper in `interview-actions.ts:446-494` — moves verbatim into `job-search.ts` as the insights transform
- AI SDK v6 `streamText`, `generateObject` — continue as used
- `tool()` from `ai` — used in `interviewTools`, moves into job_search template file

## Test fixture updates

**`scripts/onboard-fixture.ts`** (lines 407-446 `seedInterview` + lines 411-423 base row):

- Insert with explicit `template_id: "job_search", template_version: "v1"`.
- Keep existing 4 `extracted_*` writes and 5 memory_doc keys literal — Phase 1 is still job_search behavior end-to-end.

**`scripts/test-extraction.ts` line 118-122:**

- `import { JOB_SEARCH_TEMPLATE } from "@/lib/onboarding/templates/job-search"` (script-path equivalent).
- Call `await runExtractionFromTranscript(transcriptFixture, JOB_SEARCH_TEMPLATE)`.
- Assertions at lines 139-171 stay unchanged — schema shape is identical.

## Verification

**Primary regression guardrail:**

0. **`npm run test:onboarding-confirm`** (Phase 0 test) — must pass on `main` before starting the refactor. Re-run after every meaningful refactor commit. Green on both sides = confirm path preserved byte-for-byte in DB effect.

End-to-end manual (after automated guardrail passes):

1. **Migration dry-run** — apply `20260420000001_interview_template_id.sql` to a throwaway DB. Confirm existing rows get `template_id='job_search'`, `template_version='v1'`, new unique index exists, old index gone.
2. **Fresh interview** — `npm run dev`, sign in, visit `/onboard` with an empty user (use `npm run onboard:reset`). Chat through 8-12 exchanges → review screen populates → confirm → check DB: 5 `memory_documents`, 1 `pipeline_config`, 1 `user_scoring_profiles`, `onboarding_interviews.status='confirmed'`. Confirm redirect to `/activate`. Confirm `isOnboardingComplete` gate passes on next visit.
3. **Resume interview** — `npm run onboard:fixture -- --state=empty --interview-state=transcript` puts an `in_progress` row. Visit `/onboard` → router resumes, chat works.
4. **Ready-to-extract resume** — `--interview-state=ready` → router triggers `extractAndReviewAction` via the auto-extract `useEffect` at `onboard-router.tsx:63-78`. Review renders.
5. **Review mid-flight** — `--interview-state=review` pre-populates `extracted_*`. Review screen renders with saved values. Confirm writes memory docs.
6. **Three completion paths**: (a) explicit `[INTERVIEW_COMPLETE]` marker; (b) heuristic — 5+ topics covered, last assistant message has no `?` (check logs for `wrap-up heuristic triggered`); (c) hard cap at 12 assistant messages.
7. **Refresh mode** — `/onboard?mode=refresh` with a complete user. Existing profile should be spliced into systemPrompt (verify via `[onboard/chat]` request logs on the server). Review's refresh-fallback logic (review-client.tsx:70-145) still preserves un-covered topics' saved values.
8. **`npm run test:extraction`** — passes with no behavior change.
9. **`npm run test:sender-identity`** — passes (extraction-related contracts unchanged).
10. **`npm run build`** — type-checks. `OnboardingInterviewRow` carries the two new fields; all call sites either use them or ignore them.
11. **Concurrent claim** — double-click-through the `/onboard` entry fast. Unique index prevents a second active row for the same (user, template).

## Risks

- **Unique-index swap**: mitigated by single-TX create-new + drop-old. If the TX aborts, the old index persists; the CHECK-free column with DEFAULT is immaterial. No readable window where zero indexes exist.
- **Client-side template serialization**: fails without `toClientTemplate()` projector. Types enforce: client props are typed `ClientInterviewTemplate`, never `InterviewTemplate`.
- **`topics_covered` coupling in refresh fallback** (`review-client.tsx:70-73`): currently reads `topics.has("search_prefs")` etc. as literals. Safe for Phase 1 (job_search's 7 topics are frozen). Phase 2 introduces per-template refresh mapping when ICP review UI lands.
- **Thin re-export shims are tech debt**: acceptable trade for reviewable diff size. Follow-up task: delete `interview-prompt.ts` / `extraction.ts` / `extraction-prompt.ts` and migrate the ~4 remaining importers (`interview-client.tsx`, `review-client.tsx`, test scripts) after one successful prod deploy.
- **`normalizeScoringProfile` reads memory docs keyed to job_search**: untouched in Phase 1. When Phase 2 ICP template lands, its `scoring_profile_normalize` output will need its own normalizer (or the function gets a template-aware version). Flagged, not addressed.
