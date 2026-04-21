# Onboarding Interview Architecture

How the AI career-coach interview works end-to-end in GTM Command Center — from the moment the user lands on `/onboard` to the point where their profile, pipeline config, scoring weights, and outreach style are persisted and the autonomous pipeline can start running.

---

## 1. The big picture

The interview is not a form with AI sprinkled on top. It's a **streaming conversation** backed by a small state machine in Postgres, with a second "extraction" pass by a stronger model that converts the transcript into the structured records the rest of the app needs.

Three models of persistence work together:

| Layer                                       | What lives here                                                                                                                 | Why                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `onboarding_interviews` row                 | Raw UIMessages, `topics_covered`, `status`, extracted JSON                                                                      | Source-of-truth for an interview session — survives refresh, disconnect, retry |
| `memory_documents`                          | Final markdown blobs (`user_profile`, `user_positioning`, `user_dealbreakers`, `feedback_outreach_style`, `interview_insights`) | Long-lived narrative context for downstream prompts (scoring, drafting)        |
| `pipeline_config` + `user_scoring_profiles` | Structured fields (search queries, locations, threshold, scoring weights)                                                       | Machine-readable knobs the pipeline reads every run                            |

The interview row is ephemeral-ish (one active at a time per user). The memory docs and config are permanent.

---

## 2. The state machine

An `onboarding_interviews` row walks through five statuses:

```
┌────────────┐    user sends messages    ┌────────────┐
│ in_progress│ ────────────────────────▶ │ in_progress│
└─────┬──────┘   (streaming loop)        └──────┬─────┘
      │                                          │
      │  [INTERVIEW_COMPLETE] marker OR         │
      │  5+ topics + no trailing '?' OR         │
      │  12-message hard cap                    │
      │                                          ▼
      │                                   ┌────────────┐
      │   extractAndReviewAction()        │ extracting │
      └─────────────────────────────────▶ └──────┬─────┘
                                                 │ Opus JSON
                                                 ▼
                                          ┌────────────┐
                                          │   review   │ ◀── user edits cards
                                          └──────┬─────┘
                                                 │ confirmInterviewAction()
                                                 ▼
                                          ┌────────────┐
                                          │ confirmed  │
                                          └────────────┘

                  (any stage)
                      │ abandonInterviewAction()
                      ▼
                ┌───────────┐
                │ abandoned │
                └───────────┘
```

Status transitions are **atomic compare-and-set** (see `interview-actions.ts:139`) — two concurrent callers can't both run extraction.

---

## 3. End-to-end sequence

```mermaid
sequenceDiagram
    participant U as User
    participant R as OnboardRouter<br/>(client)
    participant IC as InterviewClient<br/>(useChat)
    participant API as /api/onboard/chat<br/>(route.ts)
    participant S as Sonnet 4.6<br/>(streaming)
    participant DB as onboarding_interviews
    participant IA as interview-actions.ts<br/>(server actions)
    participant O as Opus 4.6<br/>(extraction)
    participant MEM as memory_documents<br/>+ pipeline_config

    U->>R: Visit /onboard
    R->>IA: getOrCreateInterviewAction()
    IA->>DB: INSERT / SELECT row (status=in_progress)
    IA-->>R: interview row
    R->>IC: mount InterviewClient

    loop Each user turn
        U->>IC: types message
        IC->>API: POST {messages, interviewId}
        API->>DB: verify ownership + status
        API->>S: streamText(system, messages, tools)
        S-->>API: token stream + report_topics tool call
        API-->>IC: UI message stream
        API->>DB: onFinish → update messages,<br/>topics_covered, ready_for_extraction
        IC->>IA: checkInterviewStateAction() (poll)
        IA-->>IC: {readyForExtraction, topicsCovered}
    end

    Note over S,API: Completion signal:<br/>[INTERVIEW_COMPLETE]<br/>OR 5+ topics + no '?'<br/>OR 12-message cap

    IC->>IA: extractAndReviewAction(id)
    IA->>DB: CAS in_progress → extracting
    IA->>O: generateObject(transcript, extractionResultSchema)
    O-->>IA: {profile, search, outreach, insights}
    IA->>DB: UPDATE extracted_* + status=review
    IA-->>R: updated interview

    R->>U: Render ReviewClient (editable cards)
    U->>R: Edits + Confirm
    R->>IA: confirmInterviewAction(id, edits)
    IA->>MEM: upsert 5 memory_documents
    IA->>MEM: upsert pipeline_config
    IA->>MEM: normalizeScoringProfile()
    IA->>DB: status=confirmed
    IA-->>U: redirect → /activate
```

---

## 4. Phase-by-phase walkthrough

### Phase A — Entry and routing

- `src/app/(app)/onboard/page.tsx` is the server entry. It calls `getOrCreateInterviewAction()` so the page always has an interview row (active or newly created).
- `OnboardRouter` (`_components/onboard-router.tsx`) picks one of three modes:
  - **`choice`** — first-time user sees "AI interview" vs. "manual wizard"
  - **`interview`** — mounts `InterviewClient`
  - **`manual`** — mounts `OnboardClient` (the legacy step-by-step form)
- If the row is already in `review`, it jumps straight to `ReviewClient`.
- If the row is `in_progress` but `ready_for_extraction=true` (server finished the interview while the client was disconnected), it auto-fires extraction on mount — see `onboard-router.tsx:63-78`.

### Phase B — The streaming interview

This is the heart of the system. Files involved:

- `src/app/api/onboard/chat/route.ts` — the streaming endpoint
- `src/lib/onboarding/interview-prompt.ts` — system prompt + `report_topics` tool
- `src/app/(app)/onboard/_components/interview-client.tsx` — chat UI with `useChat`

**Client side** (`useChat` from `@ai-sdk/react`):

- `DefaultChatTransport` posts to `/api/onboard/chat` with `{ messages, interviewId }`.
- The chat ID is the `interviewId`, so messages resume across refresh.
- Initial messages come from `interview.messages` if present, otherwise a hard-coded opening line.

**Server side** (`route.ts`):

1. `requireUser()` + verify ownership + verify status is `in_progress` (404/400 otherwise).
2. **Hard cap at 12 assistant messages** — if already at the cap, skips generation, writes `ready_for_extraction=true`, and returns 200.
3. At assistant message ≥10, it **injects a wrap-up instruction** into the system prompt telling the model to close out on this turn.
4. `streamText({ model: claude-sonnet-4-6, system, messages, tools: interviewTools, maxOutputTokens: 1024 })`.
5. Response is `toUIMessageStreamResponse({ originalMessages, onFinish })`.

**The `report_topics` tool** (the key design trick):

```ts
report_topics: tool({
  description:
    "After every response, report which interview topics have been sufficiently covered so far.",
  inputSchema: z.object({
    covered: z.array(
      z.enum([
        "identity",
        "career",
        "proof_points",
        "tools",
        "search_prefs",
        "dealbreakers",
        "outreach_style",
      ]),
    ),
  }),
  execute: async ({ covered }) => ({ covered }),
});
```

The tool has no real side effect — its purpose is to force the model to declare topic coverage **in a structured way we can parse server-side**. In `onFinish`, the route walks every assistant message, finds all `report_topics` tool-UI parts, unions their `covered` arrays, and writes that set to `topics_covered`. The UI reads that column to show the progress pills.

### Phase C — Completion detection

Three independent paths set `ready_for_extraction=true`:

1. **Explicit marker** — the model outputs `[INTERVIEW_COMPLETE]` on its own line in the last assistant message. Primary path — taught in the system prompt.
2. **Heuristic fallback** — if ≥5 topics are covered and the last assistant message contains no `?`, treat it as a wrap-up. Catches the case where the model softens the marker away.
3. **Hard cap** — 12 assistant messages, no argument.

All three update the same flag. The client polls `checkInterviewStateAction` after each stream completes; when it flips, the client calls `extractAndReviewAction`.

### Phase D — Extraction (Opus pass)

`extractAndReviewAction` in `interview-actions.ts`:

1. **Atomic claim** — `UPDATE ... WHERE status='in_progress' RETURNING id`. Loser refetches and no-ops.
2. Formats the UIMessage array into a plain `Coach: ... / User: ...` transcript.
3. Calls `generateObject` (AI SDK v6, Opus 4.6, 4096 max tokens) with `EXTRACTION_SYSTEM_PROMPT` and `extractionResultSchema` (zod). Schema enforces shape at the boundary; per-field `.default()` calls provide fallbacks when the model omits optional values.
4. Response is typed as `ExtractionResult` (derived via `z.infer`) with four blocks:
   - **`profile`** — positioning, careerHighlights, proofPoints, technicalTools
   - **`search`** — searchQueries, searchLocations, scoreThreshold, dailySendCap
   - **`outreach`** — greenFlags, redFlags, outreachTone, whatsWorked, whatToAvoid
   - **`insights`** — career_narrative, decision_drivers, unstated_preferences, strongest_stories, positioning_alternatives, risk_tolerance, communication_style_notes
5. Writes all four into `extracted_*` columns and flips status to `review`.
6. On failure, reverts to `in_progress` so the user can retry.

**Why two models?** Sonnet is the right size for fast, warm conversational turns under 1 KB of output. Opus is the right size for a single heavy synthesis pass over the full transcript into structured JSON.

### Phase E — Review and confirm

`ReviewClient` renders editable cards (positioning, career highlights, search queries, dealbreakers, outreach tone…) pre-filled from `extracted_*`. User edits and hits Confirm.

`confirmInterviewAction` runs **sequential idempotent upserts** (any step can be retried without corruption):

```
1. memory_documents upsert → user_profile + user_positioning
2. pipeline_config upsert → search_queries, locations, threshold, daily_send_cap
3. memory_documents upsert → user_dealbreakers + feedback_outreach_style
4. memory_documents upsert → interview_insights
5. normalizeScoringProfile(svc, user.id) → derives user_scoring_profiles
6. onboarding_interviews.status = 'confirmed'
```

Only after step 6 does `isOnboardingComplete()` return true, which unlocks the redirect to `/activate` and eventually `/`.

---

## 5. Component map

```
┌──────────────────────── /onboard ──────────────────────────┐
│                                                            │
│  page.tsx  ──▶  getOrCreateInterviewAction()              │
│      │                                                     │
│      ▼                                                     │
│  OnboardRouter                                             │
│      │                                                     │
│      ├── mode='choice'   ──▶  Interview vs Manual picker   │
│      │                                                     │
│      ├── mode='interview'──▶  InterviewClient              │
│      │                          │                          │
│      │                          ├── useChat (AI SDK)       │
│      │                          │     │                    │
│      │                          │     └──▶ /api/onboard/chat
│      │                          │              │           │
│      │                          │              ├── streamText(Sonnet)
│      │                          │              └── onFinish → DB
│      │                          │                           │
│      │                          └── checkInterviewStateAction (poll)
│      │                                                     │
│      ├── status='review'   ──▶  ReviewClient               │
│      │                          └── confirmInterviewAction │
│      │                                │                    │
│      │                                ├── memory_documents │
│      │                                ├── pipeline_config  │
│      │                                └── scoring_profiles │
│      │                                                     │
│      └── mode='manual'     ──▶  OnboardClient (legacy wizard)
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 6. Why it's built this way (design notes)

- **Row-per-interview instead of just streaming in memory**: lets the user close the tab and resume, survives the "model finished the wrap-up but client disconnected before extraction" case, and gives us an audit trail if extraction goes weird.
- **`report_topics` as a tool rather than parsed from text**: forces the model to commit to a machine-readable signal every turn. Text parsing would drift; tool schemas don't.
- **Two completion signals + hard cap**: completion is adversarial — the model can forget the marker, the user can rage-quit, the conversation can spiral. Each backstop covers a different failure mode.
- **Atomic CAS on extraction**: double-clicking "continue" or a page revalidation firing twice would otherwise run Opus extraction twice on the same transcript. The CAS makes it idempotent.
- **Idempotent upserts in confirm**: any of the six writes can fail and be retried. Nothing here mutates-in-place — all `upsert({ onConflict: ... })`.
- **Memory docs + config are the public API of the interview**: downstream code (scoring, drafting, activation) never reads `onboarding_interviews`. It reads `memory_documents` and `pipeline_config`. This keeps the interview contract narrow — we can change prompt shape, model, or conversation flow freely without breaking the pipeline.

---

## 7. Key files reference

| File                                                     | Role                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `src/app/(app)/onboard/page.tsx`                         | Server entry, creates/loads interview                         |
| `src/app/(app)/onboard/_components/onboard-router.tsx`   | Mode switching, auto-extract on resume                        |
| `src/app/(app)/onboard/_components/interview-client.tsx` | useChat UI, topic pills, state polling                        |
| `src/app/(app)/onboard/_components/review-client.tsx`    | Editable review cards                                         |
| `src/app/(app)/onboard/interview-actions.ts`             | getOrCreate / extractAndReview / confirm / abandon / backTo   |
| `src/app/api/onboard/chat/route.ts`                      | Streaming endpoint, topic aggregation, completion detection   |
| `src/lib/onboarding/interview-prompt.ts`                 | Sonnet system prompt + `report_topics` tool                   |
| `src/lib/onboarding/extraction.ts`                       | Opus extraction via `generateObject` + zod schema             |
| `src/lib/onboarding/extraction-prompt.ts`                | Opus system prompt                                            |
| `src/lib/pipeline/scoring-profile.ts`                    | `normalizeScoringProfile` — derives structured scoring fields |
