"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runExtractionFromTranscript } from "@/lib/onboarding/extraction";
import { getTemplate } from "@/lib/onboarding/templates";
import type { InterviewTemplateId } from "@/lib/onboarding/templates/types";
import type {
  ExtractionInsights,
  JobSearchEdits,
  JobSearchExtraction,
} from "@/lib/onboarding/templates/job-search";
import {
  loadPositiveExemplarCount,
  nextDimensionToAsk,
} from "@/lib/onboarding/orchestrator/run";
import { toConfirmEditsForTemplate } from "@/lib/onboarding/orchestrator/to-confirm-edits";
import { claimOrphanedArtifacts } from "@/lib/onboarding/artifacts/reassign";
import {
  emptyOrchestratorState,
  type OrchestratorState,
} from "@/lib/onboarding/orchestrator/types";
import { runClaudeText } from "@/lib/ai/anthropic";
import { loadMemoryContext, formatMemoryForPrompt } from "@/lib/skills/context";
import { performConfirm, type ConfirmEdits } from "./confirm-logic";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type { UIMessage } from "ai";

interface ActionResult {
  ok: boolean;
  error?: string;
}

// ── Check Interview State (lightweight refetch for extraction trigger) ──

export async function checkInterviewStateAction(
  interviewId: string,
): Promise<{ readyForExtraction: boolean; topicsCovered: string[] }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data } = await svc
    .from("onboarding_interviews")
    .select("ready_for_extraction, topics_covered")
    .eq("id", interviewId)
    .eq("user_id", user.id)
    .single();

  return {
    readyForExtraction: data?.ready_for_extraction ?? false,
    topicsCovered: (data?.topics_covered as string[]) ?? [],
  };
}

// ── Fetch Orchestrator State (agentic mode polling) ──

export async function getOrchestratorStateAction(interviewId: string): Promise<{
  orchestratorState: OrchestratorState | null;
  interviewStatus: string;
}> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data } = await svc
    .from("onboarding_interviews")
    .select("orchestrator_state, status")
    .eq("id", interviewId)
    .eq("user_id", user.id)
    .single();

  return {
    orchestratorState:
      (data?.orchestrator_state as OrchestratorState | null) ?? null,
    interviewStatus: (data?.status as string) ?? "in_progress",
  };
}

// ── Get or Create Interview ──

export async function getOrCreateInterviewAction(
  isRefresh: boolean,
  templateId: InterviewTemplateId = "job_search",
): Promise<
  { ok: true; interview: OnboardingInterviewRow } | { ok: false; error: string }
> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const template = getTemplate(templateId);
  console.log(
    "[getOrCreateInterview] userId:",
    user.id,
    "isRefresh:",
    isRefresh,
    "templateId:",
    templateId,
  );

  // Check for existing active interview for this template. Per-template
  // scoping matches the partial unique index; different templates can have
  // concurrent active interviews for the same user.
  const { data: existing, error: existingErr } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("user_id", user.id)
    .eq("template_id", templateId)
    .in("status", ["in_progress", "extracting", "review", "story_review"])
    .maybeSingle();

  if (existingErr) {
    console.error("[getOrCreateInterview] query error:", existingErr.message);
  }

  if (existing) {
    console.log(
      "[getOrCreateInterview] found existing interview:",
      existing.id,
      "status:",
      existing.status,
    );
    return { ok: true, interview: existing as OnboardingInterviewRow };
  }

  console.log("[getOrCreateInterview] no existing interview, creating new one");

  const { data: created, error } = await svc
    .from("onboarding_interviews")
    .insert({
      user_id: user.id,
      is_refresh: isRefresh,
      template_id: templateId,
      template_version: template.version,
      status: "in_progress",
      messages: [],
      topics_covered: [],
    })
    .select("*")
    .single();

  if (error) {
    console.error(
      "[getOrCreateInterview] insert error:",
      error.message,
      error.details,
      error.code,
    );
    return { ok: false, error: error.message };
  }

  console.log("[getOrCreateInterview] created interview:", created?.id);

  // SPEC-3 Phase 4.c: when a new interview is created, claim any
  // orphaned artifacts (interview_id IS NULL) for this user. Supports
  // the persona-switch flow — abandonInterviewAction nulls the old
  // interview's artifacts so they reattach here. No-op when there are
  // no orphans. Non-fatal: artifacts can be re-uploaded if claim fails.
  if (created?.id) {
    const claimed = await claimOrphanedArtifacts(svc, user.id, created.id);
    if (claimed.count > 0) {
      console.log(
        `[getOrCreateInterview] claimed ${claimed.count} orphaned artifact(s) → interview ${created.id}`,
      );
    }
  }

  return { ok: true, interview: created as OnboardingInterviewRow };
}

// ── Extract and Review ──

export async function extractAndReviewAction(
  interviewId: string,
): Promise<
  { ok: true; interview: OnboardingInterviewRow } | { ok: false; error: string }
> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Load interview and verify ownership
  const { data: interview, error: fetchErr } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("id", interviewId)
    .single();

  if (fetchErr || !interview || interview.user_id !== user.id) {
    return { ok: false, error: "Interview not found" };
  }

  // If already in review/extracting, just return current state (idempotent).
  // Agentic safety net: if the chat route's onFinish didn't land before the
  // client transitioned (rare — user disconnected mid-wrap-up), hydrate
  // extracted_* from orchestrator_state here so the review UI has real
  // initial values to render.
  if (interview.status === "review" || interview.status === "extracting") {
    const template = getTemplate(interview.template_id);
    // Hydrate when the agentic flow landed at review without any extracted
    // payload yet (rare — typically a disconnect mid-wrap-up). Check both
    // unified and legacy slots so existing job_search rows hydrated via
    // the legacy 4-column path don't get re-written.
    const needsHydration =
      template.agenticMode &&
      interview.status === "review" &&
      interview.extracted === null &&
      interview.extracted_profile === null &&
      interview.orchestrator_state !== null;

    if (needsHydration) {
      const state = interview.orchestrator_state as OrchestratorState;
      const { edits } = toConfirmEditsForTemplate(state, template);
      const updatePayload: Record<string, unknown> = {
        extracted: edits,
        updated_at: new Date().toISOString(),
      };
      // Legacy dual-write for job_search until the cleanup commit drops
      // the four extracted_* columns (see docs/DEFERRED.md).
      if (template.id === "job_search") {
        const js = edits as JobSearchEdits;
        updatePayload.extracted_profile = js.profile;
        updatePayload.extracted_search = js.search;
        updatePayload.extracted_outreach = js.outreach;
      }
      const { data: hydrated } = await svc
        .from("onboarding_interviews")
        .update(updatePayload)
        .eq("id", interviewId)
        .select("*")
        .single();
      return {
        ok: true,
        interview: (hydrated ?? interview) as OnboardingInterviewRow,
      };
    }

    return { ok: true, interview: interview as OnboardingInterviewRow };
  }

  if (interview.status !== "in_progress") {
    return {
      ok: false,
      error: `Cannot extract from status: ${interview.status}`,
    };
  }

  // Atomic compare-and-set: only claim extraction if still in_progress.
  // Two concurrent callers: only one update matches, the loser gets 0 rows.
  const { data: claimed } = await svc
    .from("onboarding_interviews")
    .update({ status: "extracting", updated_at: new Date().toISOString() })
    .eq("id", interviewId)
    .eq("status", "in_progress")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // Another caller already claimed extraction — refetch and return
    const { data: refetched } = await svc
      .from("onboarding_interviews")
      .select("*")
      .eq("id", interviewId)
      .single();
    if (refetched) {
      return { ok: true, interview: refetched as OnboardingInterviewRow };
    }
    return { ok: false, error: "Extraction already in progress" };
  }

  try {
    const template = getTemplate(interview.template_id);
    const messages = interview.messages as UIMessage[];
    const extraction = await runExtractionFromTranscript(messages, template);

    // Dual-write: `extracted` (unified, template-agnostic) is the durable
    // path for Phase 3+. The 4 legacy columns stay written for job_search
    // until the DEFERRED cleanup drops them; non-job_search templates leave
    // the legacy columns NULL because their extraction shape doesn't map.
    const updatePayload: Record<string, unknown> = {
      status: "review",
      extracted: extraction,
      updated_at: new Date().toISOString(),
    };

    if (template.id === "job_search") {
      const js = extraction as JobSearchExtraction;
      updatePayload.extracted_profile = js.profile;
      updatePayload.extracted_search = js.search;
      updatePayload.extracted_outreach = js.outreach;
      updatePayload.extracted_insights = js.insights;
    }

    const { data: updated, error: updateErr } = await svc
      .from("onboarding_interviews")
      .update(updatePayload)
      .eq("id", interviewId)
      .select("*")
      .single();

    if (updateErr) {
      throw new Error(updateErr.message);
    }

    revalidatePath("/onboard");
    return { ok: true, interview: updated as OnboardingInterviewRow };
  } catch (err) {
    // Revert to in_progress on failure so user can retry
    await svc
      .from("onboarding_interviews")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", interviewId);

    const msg = err instanceof Error ? err.message : "Extraction failed";
    return { ok: false, error: msg };
  }
}

// ── Confirm Interview ──

export async function confirmInterviewAction(
  interviewId: string,
  edits: ConfirmEdits,
  // Optional. Only set when the user edited at least one section on the
  // story screen. Merged into both extracted.insights AND extracted_insights
  // before performConfirm runs, so the interview_insights memory_doc
  // transform reads the user's edited copy.
  editedInsights?: ExtractionInsights,
): Promise<ActionResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Agentic mode: run the orchestrator state + user-edits through the
  // adapter, persist metrics.reviewEdits into orchestrator_state before
  // confirming, then delegate to the unchanged performConfirm pathway.
  const { data: row } = await svc
    .from("onboarding_interviews")
    .select("template_id, orchestrator_state, extracted")
    .eq("id", interviewId)
    .eq("user_id", user.id)
    .single();

  if (row) {
    const template = getTemplate(row.template_id);
    if (template.agenticMode) {
      const state =
        (row.orchestrator_state as OrchestratorState | null) ??
        emptyOrchestratorState(template.id);
      const { edits: finalEdits, reviewEdits } = toConfirmEditsForTemplate(
        state,
        template,
        edits,
      );

      // If the user edited the streamed insights on the story screen,
      // persist them to both the unified column (what performConfirm reads
      // first) and the legacy column. One DB write covers both. The story
      // route already populated these columns when the stream finished —
      // this only fires when the user changed something afterward.
      if (editedInsights) {
        const updatedExtracted = {
          ...((row.extracted as Record<string, unknown>) ?? {}),
          insights: editedInsights,
        };
        await svc
          .from("onboarding_interviews")
          .update({
            extracted: updatedExtracted,
            extracted_insights: editedInsights,
            updated_at: new Date().toISOString(),
          })
          .eq("id", interviewId);
      }

      await svc
        .from("onboarding_interviews")
        .update({
          orchestrator_state: {
            ...state,
            metrics: { ...state.metrics, reviewEdits },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", interviewId);

      const agenticResult = await performConfirm(
        svc,
        user.id,
        interviewId,
        finalEdits as ConfirmEdits,
      );
      if (agenticResult.ok) {
        revalidatePath("/onboard");
        revalidatePath("/");
      }
      return agenticResult;
    }
  }

  // Legacy path
  const result = await performConfirm(svc, user.id, interviewId, edits);

  if (result.ok) {
    revalidatePath("/onboard");
    revalidatePath("/");
  }

  return result;
}

// ── Abandon Interview ──

export async function abandonInterviewAction(
  interviewId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { error } = await svc
    .from("onboarding_interviews")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", interviewId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  // SPEC-3 Phase 4.c: detach this interview's artifacts so the next
  // interview (different template) can claim them via
  // getOrCreateInterviewAction's orphan-claim step. Keeps raw user
  // content alive across persona switches without destroying it or
  // leaving it pinned to a dead interview row. Non-fatal — the abandon
  // itself succeeded; a failed null just means orphans won't be reused.
  const { error: detachErr } = await svc
    .from("onboarding_artifacts")
    .update({
      interview_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("interview_id", interviewId);

  if (detachErr) {
    console.error(
      `[abandonInterview] artifact detach failed for interview ${interviewId}:`,
      detachErr.message,
    );
  }

  revalidatePath("/onboard");
  return { ok: true };
}

// ── Back to Interview (from Review) ──

export async function backToInterviewAction(
  interviewId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { error } = await svc
    .from("onboarding_interviews")
    .update({
      status: "in_progress",
      ready_for_extraction: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", interviewId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/onboard");
  return { ok: true };
}

// ── Start Agentic Interview (kickoff first orchestrator-driven question) ──

export type StartAgenticInterviewResult =
  | { ok: true; message: UIMessage }
  | { ok: true; ready: true; interview: OnboardingInterviewRow }
  | { ok: false; error: string };

export async function startAgenticInterviewAction(
  interviewId: string,
): Promise<StartAgenticInterviewResult> {
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

  const state =
    (interview.orchestrator_state as OrchestratorState | null) ??
    emptyOrchestratorState(template.id);

  const messages = (interview.messages as UIMessage[]) ?? [];
  const latest = messages.at(-1);

  // Idempotency: if a prior kickoff already asked a dimension AND the latest
  // transcript entry is an assistant message, return that existing message.
  // Covers rapid double-click on Start Interview and resume-after-kickoff.
  if (state.activeDimensionKey && latest?.role === "assistant") {
    return { ok: true, message: latest };
  }

  const next = nextDimensionToAsk(state, template);

  // No dimension below threshold → advance straight to review. Mirrors
  // extractAndReviewAction's agentic hydration path: populate the unified
  // `extracted` slot (and the legacy 4 columns for job_search) from
  // orchestrator state, set status='review', revalidatePath. /onboard
  // routes on interview.status — there is no /onboard/review route.
  if (!next) {
    const { edits } = toConfirmEditsForTemplate(state, template);
    const updatePayload: Record<string, unknown> = {
      status: "review",
      extracted: edits,
      updated_at: new Date().toISOString(),
    };
    if (template.id === "job_search") {
      const js = edits as JobSearchEdits;
      updatePayload.extracted_profile = js.profile;
      updatePayload.extracted_search = js.search;
      updatePayload.extracted_outreach = js.outreach;
    }
    const { data: hydrated } = await svc
      .from("onboarding_interviews")
      .update(updatePayload)
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
    ? formatMemoryForPrompt(await loadMemoryContext(user.id, svc))
    : undefined;

  const positiveExemplarCount =
    template.id === "icp_definition"
      ? await loadPositiveExemplarCount(svc, interviewId)
      : undefined;

  const systemPrompt = template.interviewerSystemPrompt({
    isRefresh: interview.is_refresh,
    existingProfile,
    nextDimension: next,
    currentHypothesis: state.dimensions[next.key]?.summary ?? "",
    positiveExemplarCount,
  });

  const text = await runClaudeText({
    system: systemPrompt,
    prompt:
      "Ask the first onboarding question now, following the instructions in your system prompt.",
    model: template.chatModel,
    maxTokens: template.chatMaxOutputTokens,
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

// ── Story Phase (agentic only — stream insights then confirm) ──

// Transition review → story_review. Persists the user's review-screen edits
// to BOTH the unified `extracted` column (what performConfirm reads first)
// AND the legacy job_search columns. Mirrors the dual-write pattern in
// extractAndReviewAction and the chat route's wrap-up.
export type StartStoryPhaseResult =
  | { ok: true; interview: OnboardingInterviewRow }
  | { ok: false; error: string };

export async function startStoryPhaseAction(
  interviewId: string,
  edits: JobSearchEdits,
): Promise<StartStoryPhaseResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: interview, error: fetchErr } = await svc
    .from("onboarding_interviews")
    .select("id, user_id, status, template_id, extracted")
    .eq("id", interviewId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !interview) {
    return { ok: false, error: "Interview not found" };
  }

  // Idempotency: a second click after a successful first one finds status
  // already at story_review. Refetch the full row and return it instead of
  // erroring — the client can sync local state and route to the story view.
  if (interview.status === "story_review") {
    const { data: existing } = await svc
      .from("onboarding_interviews")
      .select("*")
      .eq("id", interviewId)
      .single();
    if (existing) {
      return {
        ok: true,
        interview: existing as OnboardingInterviewRow,
      };
    }
  }

  if (interview.status !== "review") {
    return {
      ok: false,
      error: `Cannot start story phase from status: ${interview.status}`,
    };
  }

  const template = getTemplate(interview.template_id as InterviewTemplateId);
  if (!template.agenticMode) {
    return { ok: false, error: "Story phase requires agentic template" };
  }
  if (!template.insightsSchema) {
    return {
      ok: false,
      error: "Template does not define insights synthesis",
    };
  }

  const updatedExtracted = {
    ...((interview.extracted as Record<string, unknown>) ?? {}),
    profile: edits.profile,
    search: edits.search,
    outreach: edits.outreach,
  };

  // Compare-and-set on status guards against a concurrent second writer.
  // Returning the full row in one round-trip lets the client setInterview
  // directly without a follow-up refetch — that's what fixes the
  // router.refresh() vs useState-cache mismatch.
  const { data: updated, error: updateErr } = await svc
    .from("onboarding_interviews")
    .update({
      status: "story_review",
      extracted: updatedExtracted,
      extracted_profile: edits.profile,
      extracted_search: edits.search,
      extracted_outreach: edits.outreach,
      updated_at: new Date().toISOString(),
    })
    .eq("id", interviewId)
    .eq("status", "review")
    .select("*")
    .single();

  if (updateErr) return { ok: false, error: updateErr.message };
  if (!updated) {
    return { ok: false, error: "Interview status changed under us — reload" };
  }

  revalidatePath("/onboard");
  return { ok: true, interview: updated as OnboardingInterviewRow };
}

// Transition story_review → review without dropping streamed insights so
// re-entry from review skips the handoff and lands directly in reading
// mode.
export async function backToReviewFromStoryAction(
  interviewId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { error } = await svc
    .from("onboarding_interviews")
    .update({
      status: "review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", interviewId)
    .eq("user_id", user.id)
    .eq("status", "story_review");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboard");
  return { ok: true };
}
