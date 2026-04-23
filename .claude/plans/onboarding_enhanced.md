# Plan — Career Story screen (agentic onboarding)

> Per project convention (`gtm-command-center/.claude/CLAUDE.md` §Plans), after plan approval this file should be copied to `gtm-command-center/.claude/plans/career-story-screen.md`.

## Context

The agentic onboarding flow currently hides a 30–40s Opus call inside `confirmInterviewAction` (`src/app/(app)/onboard/interview-actions.ts:317–344`). When the user clicks **Confirm & Continue** on the review screen, the action synchronously calls `runExtractionFromTranscript` to populate the `interview_insights` memory doc. The user stares at "Saving…" for the whole duration even though all the primary confirm data (profile, search prefs, outreach style, dealbreakers) is already available and could be saved instantly. The comment in the code itself acknowledges the call is "non-fatal" — but it's still awaited synchronously, which defeats the point.

The insights produced by that Opus call are substantive output — seven reflective fields (career narrative, decision drivers, unstated preferences, strongest stories, positioning alternatives, risk tolerance, communication style) that feed downstream outreach prompts and already have an (invisible-for-agentic) review-screen component (`ReviewSectionInsights`). The content is real. It's just generated invisibly and the user never gets to see it being made.

This plan turns that hidden latency into a user-facing ceremony. Between the review screen and the final save, insert a dedicated phase:

1. A **handoff screen** that frames the next step ("I've got enough to work with. Want to read what I wrote about you? Takes about thirty seconds. [Read my story]").
2. A **story screen** where the seven insights stream in one by one. Inline-editable. "Save & finish" at the bottom.

Net effect: the 30-second Opus wait becomes the payoff users were implicitly waiting for all along. Confirm itself becomes instant because insights are already persisted.

Legacy (non-agentic) flow stays unchanged — legacy still populates `extracted_insights` inside `extractAndReviewAction` and shows them inline on the review screen.

## The flow

1. Interview completes → status `review` (unchanged).
2. **Review screen** (agentic mode only): primary button label changes from **"Confirm & Continue"** → **"Continue to story"**. Handler changes from `confirmInterviewAction` → `startStoryPhaseAction`.
3. `startStoryPhaseAction`: persists current review edits to `extracted_profile / extracted_search / extracted_outreach`, transitions `status` from `review` → `story_review`.
4. Router (`onboard-router.tsx`) sees `status === "story_review"` → renders `<StoryClient>`.
5. **Story screen — handoff view** (if `extracted_insights` is null):
   - _I've got enough to work with._
   - _I took notes on everything. Want to read what I wrote about you?_
   - `[ Read my story ]`
   - _Takes about thirty seconds._
6. Click "Read my story" → client POSTs to `/api/onboard/story/stream`. Server runs `streamObject` over the transcript against the insights schema. Client consumes stream via `useObject` from `@ai-sdk/react`.
7. **Story screen — streaming view**: seven sections appear one by one with motion. Ambient "still thinking" indicator stays visible until the last field lands.
8. **Story screen — reading view**: stream completes (`onFinish` on the route persists to `extracted_insights`). Inline edit on click per section. Bottom reveals **"Save & finish"**.
9. Click "Save & finish" → `confirmInterviewAction` (now instant, no Opus call inside) → redirect to `/activate` (first-time) or `/settings` (refresh).

Agentic mode, no skip affordance on the story screen by design — the commitment was made on "Read my story" and the ceremony is what's buying the latency. "Back to review" from story is allowed and preserves streamed insights.

## Files to change

| File                                                                      | Action                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/<stamp>_story_review_status.sql`                     | **New.** Drops + recreates the `onboarding_interviews.status` CHECK constraint to add `story_review`. Rebuilds `onboarding_interviews_active_template_idx` to include `story_review` in the active set.                                                                                                                                                                                                                           |
| `src/lib/supabase/types.ts`                                               | Add `"story_review"` to the `OnboardingInterviewStatus` union (line 245–250).                                                                                                                                                                                                                                                                                                                                                     |
| `src/app/(app)/onboard/interview-actions.ts`                              | **Remove** lines 317–344 (the `runExtractionFromTranscript` block inside `confirmInterviewAction` — this is the 30s wait). Also remove the `.select(..., "extracted_insights")` from the fetch at line 296 since it's no longer read there. Add three new server actions (shapes below): `startStoryPhaseAction`, `saveStoryEditsAction`, `backToReviewFromStoryAction`.                                                          |
| `src/app/api/onboard/story/stream/route.ts`                               | **New.** POST handler. Verifies ownership, gates on `status === "story_review"` AND `extracted_insights === null` (idempotent). Calls `streamObject({ model: anthropic(template.extractionModel), schema: template.insightsSchema, system: template.insightsSystemPrompt, prompt: transcript })`. `onFinish` persists to `extracted_insights`. `maxDuration = 300`.                                                               |
| `src/lib/onboarding/story-prompt.ts`                                      | **New.** `INSIGHTS_SYSTEM_PROMPT` focused only on the seven insights fields. Derived from — and narrower than — the existing `EXTRACTION_SYSTEM_PROMPT` that job-search.ts uses for the full extraction shape.                                                                                                                                                                                                                    |
| `src/lib/onboarding/templates/types.ts`                                   | Expose optional `insightsSchema: z.ZodType<unknown>` and `insightsSystemPrompt: string` on `InterviewTemplate` (both required when `agenticMode === true`). No client-template projection change needed — these are server-only.                                                                                                                                                                                                  |
| `src/lib/onboarding/templates/job-search.ts`                              | Wire `insightsSchema: insightsSchema` (the existing export at lines 286–294) and `insightsSystemPrompt: INSIGHTS_SYSTEM_PROMPT` into the default export.                                                                                                                                                                                                                                                                          |
| `src/app/(app)/onboard/_components/onboard-router.tsx`                    | Add a branch `if (interview && interview.status === "story_review")` that renders `<StoryClient interview={...} clientTemplate={...} isRefresh={...} />`. Place above the `review` branch.                                                                                                                                                                                                                                        |
| `src/app/(app)/onboard/_components/review-sections/review-job-search.tsx` | Agentic mode only: button label → "Continue to story"; `handleConfirm` → rename to `handleContinue`, swap `confirmInterviewAction` → `startStoryPhaseAction`. Legacy mode keeps "Confirm & Continue" calling `confirmInterviewAction`. The `<ReviewSectionInsights>` render (line 301) stays — it no-ops when insights are null (already handled at line 11 of `review-section-insights.tsx`), so legacy still shows them inline. |
| `src/app/(app)/onboard/_components/story-client.tsx`                      | **New.** Client component. Owns local state machine: `handoff \| generating \| reading`. Mounts `<StoryHandoff>` or `<StoryReader>` based on state. On mount: if `interview.extracted_insights` exists, start in `reading`; else start in `handoff`.                                                                                                                                                                              |
| `src/app/(app)/onboard/_components/story-handoff.tsx`                     | **New.** Renders the finalized handoff copy + "Read my story" button. Fires a callback up to `StoryClient` to transition to `generating`.                                                                                                                                                                                                                                                                                         |
| `src/app/(app)/onboard/_components/story-reader.tsx`                      | **New.** Streaming + edit UI. Uses `useObject` from `@ai-sdk/react` pointed at `/api/onboard/story/stream`. Renders seven sections with motion (reuses `motion/react` patterns already in the codebase). Inline edit on click → textarea → save-on-blur via `saveStoryEditsAction`. "Save & finish" button at bottom calls `confirmInterviewAction`. "Back to review" link calls `backToReviewFromStoryAction`.                   |

## State machine

### Server (`onboarding_interviews.status`)

```
in_progress → extracting → review → story_review → confirmed
                               ↓           ↓
                         (legacy path) (back)
```

- `review → story_review` via `startStoryPhaseAction(interviewId, edits)`. Persists `edits` to `extracted_profile/search/outreach`, updates `status`.
- `story_review → review` via `backToReviewFromStoryAction(interviewId)`. Leaves `extracted_insights` intact so a re-entry skips the handoff.
- `story_review → confirmed` via existing `confirmInterviewAction` (unchanged signature — still takes `JobSearchEdits`, which are already persisted, so client can re-read and resubmit).

### Client (`StoryClient` local state)

```
mount → (insights null ? handoff : reading)
handoff → click "Read my story" → generating
generating → stream onFinish → reading
reading → click "Save & finish" → confirmAction (loading) → router.push(...)
reading → click "Back to review" → backAction → router.refresh()
```

## Refresh resilience

Status is `story_review` in DB. On any client-side refresh:

- Router reads `interview.status === "story_review"` → mounts `<StoryClient>`.
- `StoryClient` checks `interview.extracted_insights`:
  - Populated → start in `reading` (skip handoff).
  - Null → start in `handoff`. User re-clicks "Read my story" to trigger the stream again.

V1 policy on mid-stream failures: if the stream fails before `onFinish`, nothing is persisted (`extracted_insights` stays null) and the user re-clicks. Simpler than partial-field resume.

## Reused primitives

- `runExtractionFromTranscript` pattern → transcript formatter at `src/lib/onboarding/extraction.ts:6–19` is worth lifting into `src/lib/onboarding/transcript.ts` since both the existing `generateObject` call and the new `streamObject` call need it. Light extraction — a one-function file.
- `generateObject` → swap to `streamObject` from `ai` package (AI SDK v6). Both consume the same zod schema.
- `useObject` from `@ai-sdk/react` for client-side structured-output streaming.
- `performConfirm` at `src/app/(app)/onboard/confirm-logic.ts:19` — **unchanged**. Still reads `extracted_insights` via the job-search template's `interview_insights` memory-doc output transform (`job-search.ts:433–443`). The transform stays as-is; its input now comes from a field populated by the story route instead of by `confirmInterviewAction`.
- `requireUser()` from `@/lib/supabase/server` + `createSupabaseServiceClient()` from `@/lib/supabase/service` — same patterns as existing server actions.
- `insightsSchema` at `src/lib/onboarding/templates/job-search.ts:286–294` — reused as-is.
- `formatInsightsAsMarkdown` at `job-search.ts:325` — reused unchanged for the memory-doc transform.
- `motion/react` + `AnimatePresence` — see `src/components/ui/cyclic-loader.tsx` for the in-codebase motion vocabulary. Story-reader section reveals should borrow from it, not introduce a new vocabulary.
- `CyclicLoader` component at `src/components/ui/cyclic-loader.tsx` — candidate for the ambient "still thinking" indicator on the story reader (three pulsing dots + cycling status text like "Reading your resume…", "Noticing patterns…", "Drafting the narrative…").

## New server-action shapes (sketches)

Not prescriptive — implementation can refine. These show the contract.

```ts
// src/app/(app)/onboard/interview-actions.ts

export async function startStoryPhaseAction(
  interviewId: string,
  edits: JobSearchEdits,
): Promise<ActionResult> {
  // 1. requireUser, svc
  // 2. fetch interview, verify ownership + status === "review"
  // 3. verify template.agenticMode === true (reject for legacy)
  // 4. update: status = "story_review",
  //    extracted_profile = edits.profile,
  //    extracted_search = edits.search,
  //    extracted_outreach = edits.outreach
  // 5. revalidatePath("/onboard")
}

export async function saveStoryEditsAction(
  interviewId: string,
  editedInsights: Partial<ExtractionInsights>,
): Promise<ActionResult> {
  // 1. requireUser, svc
  // 2. fetch interview, verify ownership + status === "story_review"
  // 3. merge editedInsights over existing extracted_insights, update the column
  // No revalidate — per-field inline save, client has optimistic state
}

export async function backToReviewFromStoryAction(
  interviewId: string,
): Promise<ActionResult> {
  // 1. requireUser, svc
  // 2. fetch interview, verify ownership + status === "story_review"
  // 3. update: status = "review". Leaves extracted_insights intact.
  // 4. revalidatePath("/onboard")
}
```

## Migration sketch

```sql
-- supabase/migrations/<stamp>_story_review_status.sql

-- 1. Extend status check constraint
ALTER TABLE public.onboarding_interviews
  DROP CONSTRAINT IF EXISTS onboarding_interviews_status_check;

ALTER TABLE public.onboarding_interviews
  ADD CONSTRAINT onboarding_interviews_status_check
  CHECK (status IN (
    'in_progress', 'extracting', 'review',
    'story_review', 'confirmed', 'abandoned'
  ));

-- 2. Rebuild active-interview unique index to include story_review
DROP INDEX IF EXISTS public.onboarding_interviews_active_template_idx;

CREATE UNIQUE INDEX onboarding_interviews_active_template_idx
  ON public.onboarding_interviews (user_id, template_id)
  WHERE status IN ('in_progress', 'extracting', 'review', 'story_review');
```

## Motion & UI notes

- **Handoff screen** — centered card, max-w-md. Fade-in + small rise on mount (200–300ms). No other chrome.
- **Story reader** — narrower reading column than the review screen (max-w-xl, lots of whitespace). Document-feel, not form-feel.
- **Section reveal** — as each field arrives via `useObject`, section heading slides up (Y from 8px, opacity 0→1), content fades in. Use `AnimatePresence` + `motion.div` with the transition shape already in `cyclic-loader.tsx`.
- **Ambient indicator** — `CyclicLoader` with messages like `["Reading your resume…", "Noticing patterns…", "Drafting the narrative…"]`. Lives at the bottom of the streaming view until the final field arrives.
- **Inline edit** — click a section → turns into a textarea with a subtle border highlight → save on blur via `saveStoryEditsAction`. No edit mode toggle; every section is edit-on-click.
- **Save & finish button** — only appears once all seven fields have rendered. Primary button, bottom-right of the reading column.

## Verification

1. **`npm run test:onboarding-confirm` — green.** The Opus-in-confirm removal does not affect legacy path (legacy populates `extracted_insights` in `extractAndReviewAction`, confirm just reads it).
2. **`npm run build` — strict typecheck passes.** New union member, new server actions, new route handler all typed.
3. **Happy agentic path** — `npm run onboard:reset && npm run dev`. `/onboard` → drop artifacts → chat → review screen shows. Click "Continue to story". Status in DB flips to `story_review`. Handoff screen renders. Click "Read my story". Streaming visible for ~20–40s, sections arrive in order. `extracted_insights` in DB is populated after `onFinish`. Inline-edit one section → save on blur → refetch DB → edit persists. Click "Save & finish". Toast and redirect complete in <1s (measure). DB: `memory_documents` has `interview_insights` row; `onboarding_interviews.status === "confirmed"`.
4. **Refresh mid-generation** — at `generating` state, hard-refresh the browser. Page re-lands on `/onboard`, router routes on `status === "story_review"`, `StoryClient` mounts. `extracted_insights` is null → starts in `handoff`. User re-clicks "Read my story" → stream runs again cleanly.
5. **Refresh post-generation** — refresh after stream completes. `extracted_insights` populated → `StoryClient` starts in `reading`. No re-stream.
6. **Back to review round-trip** — from `reading`, click "Back to review". Status reverts to `review`; `extracted_insights` preserved. Click "Continue to story" again. Lands in `reading` (not handoff) because insights exist. No regeneration.
7. **Confirm latency** — time between "Save & finish" click and redirect. Must be <1s. Compare against the pre-change 20–40s baseline.
8. **Legacy path** (`agenticMode === false`) — `/onboard?legacy=1` or a template with `agenticMode: false`. Review screen shows "Confirm & Continue", insights visible inline in the existing "Coach Notes" section, confirm works normally. No story screen involved.
9. **Double-click "Continue to story"** — button disabled during pending action (existing `isPending` guard in `handleConfirm` applies). Only one status update succeeds.
10. **Double-click "Read my story"** — stream route's status+insights guard rejects a second call when status is `story_review` AND insights are null but an earlier stream is already running. Simplest enforcement: client disables the button once clicked until response arrives; server's idempotency is a secondary guard.

## Open for polish (flagged, not blocking)

- **Review-screen button copy** — "Continue to story" is the pick. Alternatives worth trying once in place: "Continue", "Next →", "I'm ready". Decide after seeing it.
- **Ambient indicator pattern** — `CyclicLoader` dots + rotating text is the default, but a thin breathing line or slow shimmer behind the current streaming heading could feel more cinematic. Try it in situ.
- **Re-stream vs partial-resume on refresh** — V1 re-streams whole. If Opus costs start to matter, partial-resume is additive.
- **Back-link placement on story screen** — bottom-left, muted? Top-left, ghost? Decide during build.

## Not in scope

- Making `insights` part of `JobSearchEdits`. Insights edits write directly to `extracted_insights` via `saveStoryEditsAction`. The existing `interview_insights` memory-doc transform reads from that column — no `editsSchema` change.
- Speeding up the Opus call (model swap to Sonnet, shorter prompt). The whole point of this feature is to make the latency a reward rather than a wait. Keep `claude-opus-4-6`.
- Streaming for the legacy path. Legacy keeps the `extracting` loader screen.
- Pre-fix data migration. No rows have `status === "story_review"` yet. `npm run onboard:reset` for dev.
- Changes to `ReviewSectionInsights` (`src/app/(app)/onboard/_components/review-sections/review-section-insights.tsx`). Stays as-is; still used by legacy.
