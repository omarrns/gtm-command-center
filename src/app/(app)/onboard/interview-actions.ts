"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runExtractionFromTranscript } from "@/lib/onboarding/extraction";
import { getTemplate } from "@/lib/onboarding/templates";
import type { InterviewTemplateId } from "@/lib/onboarding/templates/types";
import type { JobSearchExtraction } from "@/lib/onboarding/templates/job-search";
import { nextDimensionToAsk } from "@/lib/onboarding/orchestrator/run";
import { toJobSearchConfirmEdits } from "@/lib/onboarding/orchestrator/to-confirm-edits";
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
    .in("status", ["in_progress", "extracting", "review"])
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
    const needsHydration =
      template.agenticMode &&
      interview.status === "review" &&
      interview.extracted_profile === null &&
      interview.orchestrator_state !== null;

    if (needsHydration) {
      const state = interview.orchestrator_state as OrchestratorState;
      const { edits } = toJobSearchConfirmEdits(state);
      const { data: hydrated } = await svc
        .from("onboarding_interviews")
        .update({
          extracted_profile: edits.profile,
          extracted_search: edits.search,
          extracted_outreach: edits.outreach,
          updated_at: new Date().toISOString(),
        })
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
): Promise<ActionResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Agentic mode: run the orchestrator state + user-edits through the
  // adapter, persist metrics.reviewEdits into orchestrator_state before
  // confirming, then delegate to the unchanged performConfirm pathway.
  const { data: row } = await svc
    .from("onboarding_interviews")
    .select("template_id, orchestrator_state, messages, extracted_insights")
    .eq("id", interviewId)
    .eq("user_id", user.id)
    .single();

  if (row) {
    const template = getTemplate(row.template_id);
    if (template.agenticMode) {
      const state =
        (row.orchestrator_state as OrchestratorState | null) ??
        emptyOrchestratorState(template.id);
      const { edits: finalEdits, reviewEdits } = toJobSearchConfirmEdits(
        state,
        edits,
      );

      // Synthesize insights from the transcript so agentic users get the
      // same interview_insights memory doc that legacy users do. Skipped
      // on re-confirm (idempotent) via the null-check on extracted_insights.
      // Non-fatal: if insights synthesis fails, confirm still succeeds and
      // the user keeps the 4 durable memory docs.
      if (!row.extracted_insights) {
        try {
          const messages = (row.messages ?? []) as UIMessage[];
          if (messages.length > 0) {
            const extraction = await runExtractionFromTranscript(
              messages,
              template,
            );
            // Agentic insights synthesis is job_search-specific (ICP has no
            // insights leaf). Cast is safe because template.agenticMode is
            // only true for job_search in this branch today; if/when ICP
            // adds its own synthesis, this block narrows per template.id.
            const js = extraction as JobSearchExtraction;
            await svc
              .from("onboarding_interviews")
              .update({
                extracted_insights: js.insights,
                updated_at: new Date().toISOString(),
              })
              .eq("id", interviewId);
          }
        } catch (err) {
          console.error(
            "[confirmInterviewAction] insights synthesis failed:",
            err instanceof Error ? err.message : String(err),
          );
        }
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
        finalEdits,
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
  // extractAndReviewAction's agentic hydration path: populate extracted_*
  // from orchestrator state, set status='review', revalidatePath. /onboard
  // routes on interview.status — there is no /onboard/review route.
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
    ? formatMemoryForPrompt(await loadMemoryContext(user.id, svc))
    : undefined;

  const systemPrompt = template.interviewerSystemPrompt({
    isRefresh: interview.is_refresh,
    existingProfile,
    nextDimension: next,
    currentHypothesis: state.dimensions[next.key]?.summary ?? "",
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
