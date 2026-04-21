# Fix — Agentic onboarding shows legacy opening instead of first orchestrator-driven question

## Context

SPEC-2 agentic onboarding is live. E2E testing in the browser exposed a UX/product bug: after pasting a resume and clicking **Start interview**, the first assistant message is the legacy static `OPENING_MESSAGE` ("Hey! I'm here to get a quick read on who you are..."). That's a generic "what do you do?" question that ignores every inference the orchestrator just produced.

Two problems rolled into one:

1. **Wrong copy.** After the orchestrator read a resume + LinkedIn + personal site, asking a generic intro question wastes the user's time and defeats the point of agentic onboarding. The first question should be tied to a specific low-confidence dimension.
2. **Orphaned answer.** When the user answers the legacy opening, `state.activeDimensionKey === null`. In `handleAgenticTurn`, dimension updates only fire when `activeDimensionKey` is set, so the user's first answer is dropped on the floor — never attributed, never folded into `dimensions[*]`.

The agentic interviewer path (`template.interviewerSystemPrompt(ctx, nextDimension)` + Sonnet) is already wired and already capable of producing the right first question — it just isn't invoked before the user types.

## Root cause

Client-side in `src/app/(app)/onboard/_components/interview-client.tsx` (AgenticInterview, ~lines 99–103):

```ts
const openingText = interview.is_refresh
  ? clientTemplate.refreshOpeningMessage
  : clientTemplate.openingMessage;
const initialMessages: UIMessage[] =
  storedMessages.length > 0 ? storedMessages : [buildOpening(openingText)];
```

On a brand-new agentic interview (`storedMessages.length === 0`), `useChat` seeds with the legacy template opening. No server round-trip fires between "artifact analysis done" and "user types first answer." The orchestrator never gets a chance to pick a dimension and phrase the first question.

`src/app/api/onboard/chat/route.ts` already handles the `activeDimensionKey === null` case correctly — it falls through past dimension-update and calls `nextDimensionToAsk(state, template)`. The missing piece is purely client-side kickoff.

## Approach — server-action kickoff (Option A)

Add `startAgenticInterviewAction(interviewId)`. The client calls it once on phase transition from artifact → chat. Server action:

1. Loads interview + template + `orchestrator_state`.
2. **Idempotency check** — if `state.activeDimensionKey` is set AND the latest stored message is assistant, returns that existing message (handles rapid double-clicks and resume-after-kickoff).
3. Computes `next = nextDimensionToAsk(state, template)`.
4. If `null` (every dimension above threshold): server action itself transitions the interview to review — mirrors the existing `extractAndReviewAction` agentic hydration path (populates `extracted_profile/search/outreach` from `toJobSearchConfirmEdits(state).edits`, sets `status='review'`, `revalidatePath('/onboard')`). Returns `{ ok: true, ready: true, interview }`. Client calls `router.refresh()` and the `/onboard` page routes to the review view based on `interview.status` — there is no separate `/onboard/review` route.
5. Otherwise: produces the first interviewer question via `runClaudeText` (existing wrapper in `src/lib/ai/anthropic.ts` around AI SDK v6 `generateText`) using `template.chatModel` and `template.interviewerSystemPrompt(...)`.
6. Persists to `onboarding_interviews`:
   - `messages = [...messages, assistantMessage]`
   - `orchestrator_state.activeDimensionKey = next.key`
   - `orchestrator_state.nextDimensionKey = next.key`
   - `orchestrator_state.askedDimensionKeys = [...askedDimensionKeys, next.key]`
   - `orchestrator_state.metrics.questionCount += 1`
7. Returns `{ ok: true, message: UIMessage }`.

Client side: gate the `useChat`-owning component behind a kickoff fetch. Split the existing `AgenticInterview` into a parent (phase/kickoff owner, no `useChat`) and a child `AgenticChat` (owns `useChat`). This avoids conditionally calling hooks — `useChat` only runs once, inside `AgenticChat`, which is mounted as a whole or not at all.

Drop the `buildOpening(openingText)` fallback from the agentic path. Leave `LegacyInterview` untouched — `OPENING_MESSAGE` stays for `agenticMode === false` and any `/onboard?legacy=1` flag.

### Why server action, not a streaming kickoff POST

| Option                                                                          | Pro                                                                                                                                                  | Con                                                                                                                                                    |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Server action** (chosen)                                                   | Idempotent by construction. No route change. Simpler client state machine. Mirrors existing `getOrchestratorStateAction` / `extractAndReviewAction`. | First question doesn't stream; ~1–3s Sonnet latency covered by a placeholder.                                                                          |
| B. `isKickoff: true` flag on `/api/onboard/chat` + synthetic empty user message | First question streams.                                                                                                                              | Route coupling; useChat transcript either pollutes with a fake user turn or needs custom render filtering; idempotency needs extra guard in the route. |

Option A is cleaner for v1. If the placeholder feels laggy in live use, Option B is additive.

## Files to modify

| File                                                     | Change                                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(app)/onboard/interview-actions.ts`             | New exported server action `startAgenticInterviewAction(interviewId)`. Uses `const user = await requireUser(); const svc = createSupabaseServiceClient();` pattern consistent with this file. |
| `src/app/(app)/onboard/_components/interview-client.tsx` | Split current `AgenticInterview` into a parent (kickoff owner) and a new `AgenticChat` child that owns `useChat`. Add `GeneratingFirstQuestion` placeholder. `LegacyInterview` untouched.     |

No changes to:

- `src/app/api/onboard/chat/route.ts` — `handleAgenticTurn` already handles `activeDimensionKey === null` correctly; every subsequent turn runs unchanged.
- `src/lib/onboarding/orchestrator/run.ts` — `nextDimensionToAsk` is the right primitive.
- `src/lib/onboarding/templates/job-search.ts` — `interviewerSystemPrompt` already accepts `nextDimension`.
- `src/lib/onboarding/interview-prompt.ts` — `OPENING_MESSAGE` stays for legacy.
- DB schema — no migration; reuses `orchestrator_state` + `messages` columns.

Reused primitives (no new deps):

- `requireUser()` from `@/lib/supabase/server` (returns user, not a destructure)
- `createSupabaseServiceClient()` from `@/lib/supabase/service`
- `getTemplate(id)` from `@/lib/onboarding/templates/index.ts`
- `nextDimensionToAsk(state, template)` from `@/lib/onboarding/orchestrator/run.ts`
- `toJobSearchConfirmEdits(state)` from `@/lib/onboarding/orchestrator/to-confirm-edits.ts` (for the `ready: true` hydration path)
- `runClaudeText({ system, prompt, model, maxTokens })` from `@/lib/ai/anthropic.ts` — wraps AI SDK v6 `generateText` with the codebase's standard `system` + `prompt` call shape
- `nanoid()` from `nanoid`
- `revalidatePath` from `next/cache`

## Critical code shapes

**`src/app/(app)/onboard/interview-actions.ts`** — append next to existing actions, matching the file's `requireUser` + `createSupabaseServiceClient` pattern:

```ts
export async function startAgenticInterviewAction(
  interviewId: string,
): Promise<
  | { ok: true; message: UIMessage }
  | { ok: true; ready: true; interview: OnboardingInterviewRow }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: interview, error } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("id", interviewId)
    .eq("user_id", user.id)
    .single();

  if (error || !interview) return { ok: false, error: "Interview not found" };

  const template = getTemplate(interview.template_id as InterviewTemplateId);
  if (!template.agenticMode) {
    return { ok: false, error: "Not an agentic interview" };
  }

  const state = interview.orchestrator_state as OrchestratorState | null;
  if (!state) {
    return {
      ok: false,
      error: "Orchestrator state missing — artifact analysis did not run",
    };
  }

  // Idempotency: first question already generated?
  const messages = (interview.messages as UIMessage[]) ?? [];
  const latest = messages.at(-1);
  if (state.activeDimensionKey && latest?.role === "assistant") {
    return { ok: true, message: latest };
  }

  const next = nextDimensionToAsk(state, template);

  // Ready-to-review: mirror extractAndReviewAction's agentic hydration path.
  // No /onboard/review route — /onboard routes on interview.status.
  if (!next) {
    const { edits } = toJobSearchConfirmEdits(state);
    const { data: hydrated } = await svc
      .from("onboarding_interviews")
      .update({
        status: "review",
        extracted_profile: edits.profile,
        extracted_search: edits.search,
        extracted_outreach: edits.outreach,
        updated_at: new Date().toISOString(),
      })
      .eq("id", interviewId)
      .select("*")
      .single();
    revalidatePath("/onboard");
    return {
      ok: true,
      ready: true,
      interview: (hydrated ?? interview) as OnboardingInterviewRow,
    };
  }

  const existingProfile = interview.is_refresh
    ? await loadExistingProfileText(svc, user.id) // reuse whichever helper confirm/extract actions already use; pass undefined otherwise
    : undefined;

  const systemPrompt = template.interviewerSystemPrompt({
    isRefresh: interview.is_refresh,
    existingProfile,
    nextDimension: next,
    currentHypothesis: state.dimensions[next.key]?.summary ?? "",
  });

  // runClaudeText wraps AI SDK v6 generateText with the project's standard
  // { system, prompt, model, maxTokens } shape. The system prompt carries
  // all the dimension context; the prompt just nudges the model to speak.
  const text = await runClaudeText({
    system: systemPrompt,
    prompt: "Ask the first onboarding question now.",
    model: template.chatModel,
    maxTokens: 1024,
  });

  const assistantMessage: UIMessage = {
    id: nanoid(),
    role: "assistant",
    parts: [{ type: "text", text }],
  };

  const newState: OrchestratorState = {
    ...state,
    activeDimensionKey: next.key,
    nextDimensionKey: next.key,
    askedDimensionKeys: [...state.askedDimensionKeys, next.key],
    metrics: {
      ...state.metrics,
      questionCount: state.metrics.questionCount + 1,
    },
  };

  const { error: updateError } = await svc
    .from("onboarding_interviews")
    .update({
      messages: [...messages, assistantMessage],
      orchestrator_state: newState,
      updated_at: new Date().toISOString(),
    })
    .eq("id", interviewId);

  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true, message: assistantMessage };
}
```

**`src/app/(app)/onboard/_components/interview-client.tsx`** — split the agentic branch into a phase-owning parent and a `useChat`-owning child. This keeps every hook call unconditional within its component.

```tsx
// Parent: owns phase + kickoff state. Does NOT call useChat.
function AgenticInterview({ interview, clientTemplate /* …existing props */ }) {
  const router = useRouter();
  const storedMessages = (interview.messages as UIMessage[]) ?? [];
  const hasStored = storedMessages.length > 0;

  const [kickoff, setKickoff] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; message: UIMessage }
    | { status: "alreadyComplete" }
    | { status: "error"; error: string }
  >({ status: hasStored ? "ready" : "idle" });

  useEffect(() => {
    if (hasStored || kickoff.status !== "idle") return;
    setKickoff({ status: "loading" });
    let cancelled = false;
    (async () => {
      const result = await startAgenticInterviewAction(interview.id);
      if (cancelled) return;
      if (!result.ok) {
        setKickoff({ status: "error", error: result.error });
        toast.error(result.error);
        return;
      }
      if ("ready" in result && result.ready) {
        // Server already set status='review' + hydrated extracted_*.
        // revalidatePath ran server-side; router.refresh pulls fresh row.
        setKickoff({ status: "alreadyComplete" });
        router.refresh();
        return;
      }
      if ("message" in result) {
        setKickoff({ status: "ready", message: result.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasStored, interview.id, kickoff.status, router]);

  // Branch on kickoff state. Hooks above already fired unconditionally.
  if (!hasStored && kickoff.status === "loading") {
    return <GeneratingFirstQuestion />;
  }
  if (kickoff.status === "alreadyComplete") {
    return <GeneratingFirstQuestion note="Finalizing…" />;
  }
  if (!hasStored && kickoff.status === "error") {
    return (
      <KickoffErrorRetry
        error={kickoff.error}
        onRetry={() => setKickoff({ status: "idle" })}
      />
    );
  }

  const initialMessages: UIMessage[] = hasStored
    ? storedMessages
    : kickoff.status === "ready"
      ? [kickoff.message]
      : []; // unreachable given the guards above; keeps the type system happy

  return (
    <AgenticChat
      interview={interview}
      clientTemplate={clientTemplate}
      initialMessages={initialMessages}
      /* …pass through existing props */
    />
  );
}

// Child: owns useChat. Mounted as a whole once initialMessages is known.
function AgenticChat({ interview, clientTemplate, initialMessages /* … */ }) {
  const { messages, input, handleSubmit, handleInputChange, status } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/onboard/chat",
      body: { interviewId: interview.id },
    }),
    // …rest of existing useChat config unchanged
  });

  // …render chat UI (lift the existing JSX from AgenticInterview into here)
}
```

`GeneratingFirstQuestion`:

```tsx
function GeneratingFirstQuestion({ note = "Reading what you shared…" }) {
  return (
    <div className="surface-muted flex items-center gap-3 p-6">
      <RefreshCw size={14} className="animate-spin" />
      <p className="text-sm text-muted-foreground">{note}</p>
    </div>
  );
}
```

**No prompt change required.** `template.interviewerSystemPrompt(ctx, nextDimension)` already produces a dimension-specific question. If the first question feels abrupt (missing a "read your stuff" acknowledgment), that's a surgical, additive tweak inside `src/lib/onboarding/templates/job-search.ts` — not a plan blocker.

## Edge cases

| Case                                           | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New interview, artifacts succeeded             | `storedMessages=[]`, state populated → server action → dimension-specific first question → `activeDimensionKey` set → next user answer attributes correctly.                                                                                                                                                                                                                                                                |
| New interview, zero artifacts / all failed     | `state.dimensions[*]` populated with `status: "unknown"` and confidence 0 → `nextDimensionToAsk` returns first dimension → first question still routed through interviewer prompt → `activeDimensionKey` valid.                                                                                                                                                                                                             |
| User refreshes mid-question (before answering) | `storedMessages=[firstAssistantQuestion]`, `activeDimensionKey` set → client takes stored-messages path; no server-action call; no duplicate.                                                                                                                                                                                                                                                                               |
| User refreshes mid-interview                   | `storedMessages` has N turns, `activeDimensionKey` set → same stored-messages path.                                                                                                                                                                                                                                                                                                                                         |
| Rapid double-click Start Interview             | Second invocation sees `activeDimensionKey` set + latest is assistant → returns existing message. No duplicate question. No duplicate `askedDimensionKeys` entry.                                                                                                                                                                                                                                                           |
| Legacy mode (`agenticMode === false`)          | `LegacyInterview` untouched — static `OPENING_MESSAGE` still the first message.                                                                                                                                                                                                                                                                                                                                             |
| All dims above threshold after analysis        | Server action hydrates `extracted_*` + sets `status='review'` + `revalidatePath('/onboard')`. Client `router.refresh()` → `/onboard` renders the review view. No route change.                                                                                                                                                                                                                                              |
| Server action fails (network / DB / LLM)       | Client shows toast + retry. Kickoff state → `error`; user can click Start again. DB update only happens after successful LLM call — no partial-state writes.                                                                                                                                                                                                                                                                |
| **Stale pre-fix interviews**                   | An interview row created before this fix may have `storedMessages = [legacy OPENING_MESSAGE]` and no `activeDimensionKey`. The `hasStored` branch will render the legacy opening. Acceptable for dev/local since we can just `npm run onboard:reset`. If shipped to real users, add a one-time cleanup (or a guard that strips a known-legacy first message when `activeDimensionKey === null`). Out of scope for this fix. |

## Verification

0. `npm run test:onboarding-confirm` — legacy path green.
1. `npm run test:confirm-adapter` — still 24/24.
2. `npm run build` — strict typecheck passes.
3. `npm run onboard:reset && npm run dev`.
4. **Happy path** — paste resume text at `/onboard`. Orchestrator status panel populates. Click **Start interview**.
   - Placeholder visible ~1–3s.
   - **First assistant message is NOT `OPENING_MESSAGE`.** It references inferred positioning / experience.
   - DB: `orchestrator_state.activeDimensionKey` is a real dimension key (e.g., `careerHighlights`); `askedDimensionKeys.length === 1`; `metrics.questionCount === 1`.
5. Answer the first question → DB: `dimensions[active].status === "answered"` + confidence bumped. `askedDimensionKeys` increments as the next question fires.
6. Hard-refresh the browser mid-question → interview resumes on stored messages; no duplicate first-question; `askedDimensionKeys` length unchanged.
7. Zero-artifact path: click "Continue without artifacts" → first question still through the agentic interviewer path (not static opening).
8. LinkedIn scrape failure → paste text fallback → happy path proceeds.
9. Double-click Start Interview rapidly → exactly one first-question assistant message in transcript + exactly one `askedDimensionKeys` entry.
10. Already-ready case (mocked by manually marking every dim above threshold): server action returns `ready: true` + `/onboard` renders the review view after `router.refresh()` — no navigation, no `/onboard/review` route hit.
11. Legacy path: `/onboard?legacy=1` (or `agenticMode: false` template) → `OPENING_MESSAGE` still rendered.
12. Full flow through review + confirm → 5 memory_documents + pipeline_config + user_scoring_profiles + `status='confirmed'` (no confirm-path regression).

## Non-goals

- Streaming the first question. Placeholder is acceptable v1; streaming is additive via Option B if the non-streaming gap feels bad in practice.
- New DB columns. Reuses `orchestrator_state` + `messages`.
- Deleting `OPENING_MESSAGE` — legacy path still imports it.
- Changing orchestrator or interviewer prompts. Dimension-specific first question is already what `interviewerSystemPrompt` produces.
- Adding a "Read your materials" preamble as a separate transcript message. The placeholder carries that signal; a separate preamble would need a null-key exception to the turn-loop invariant, which is worse than the generic-opening problem we're fixing.
- Backfilling or cleaning up pre-fix agentic interview rows that already contain the legacy opening in `messages`. Handled by `npm run onboard:reset` in dev; production cleanup is out of scope for this fix.
