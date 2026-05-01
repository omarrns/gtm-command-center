"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getTemplate } from "@/lib/onboarding/templates";
import type { InterviewTemplateId } from "@/lib/onboarding/templates/types";
import {
  loadPositiveExemplarCount,
  nextDimensionToAsk,
} from "@/lib/onboarding/orchestrator/run";
import { toConfirmEditsForTemplate } from "@/lib/onboarding/orchestrator/to-confirm-edits";
import {
  emptyOrchestratorState,
  type OrchestratorState,
} from "@/lib/onboarding/orchestrator/types";
import { runClaudeText } from "@/lib/ai/anthropic";
import { loadMemoryContext, formatMemoryForPrompt } from "@/lib/skills/context";
import { performConfirm, type ConfirmEdits } from "./confirm-logic";
import { getOrCreateInterview } from "./get-or-create-interview";
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
  console.log(
    "[getOrCreateInterview] userId:",
    user.id,
    "isRefresh:",
    isRefresh,
    "templateId:",
    templateId,
  );
  return getOrCreateInterview(svc, user.id, isRefresh, templateId);
}

// ── Confirm Interview ──

export async function confirmInterviewAction(
  interviewId: string,
  edits: ConfirmEdits,
  // Optional. Only set when the user edited at least one section on the
  // story screen. Merged into extracted.insights before performConfirm
  // runs, so the interview_insights memory_doc transform reads the user's
  // edited copy.
  editedInsights?: unknown,
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
      // persist them to extracted.insights so performConfirm picks up the
      // edited copy. The story route already populated this when the
      // stream finished — this only fires when the user changed something
      // afterward.
      if (editedInsights) {
        const updatedExtracted = {
          ...((row.extracted as Record<string, unknown>) ?? {}),
          insights: editedInsights,
        };
        await svc
          .from("onboarding_interviews")
          .update({
            extracted: updatedExtracted,
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
  // `extracted` slot from orchestrator state, set status='review',
  // revalidatePath. /onboard routes on interview.status — there is no
  // /onboard/review route.
  if (!next) {
    const { edits } = toConfirmEditsForTemplate(state, template);
    const { data: hydrated } = await svc
      .from("onboarding_interviews")
      .update({
        status: "review",
        extracted: edits,
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

  const positiveExemplarCount =
    template.id === "icp_definition"
      ? await loadPositiveExemplarCount(svc, interviewId)
      : undefined;

  const dim = state.dimensions[next.key];
  const systemPrompt = template.interviewerSystemPrompt({
    isRefresh: interview.is_refresh,
    existingProfile,
    nextDimension: next,
    currentHypothesis: dim?.summary ?? "",
    positiveExemplarCount,
    hypothesisValue: dim?.value,
    hypothesisConfidence: dim?.confidence,
  });

  const text = await runClaudeText({
    system: systemPrompt,
    prompt:
      "Ask the first onboarding question now, following the instructions in your system prompt.",
    model: template.chatModel,
    maxTokens: template.chatMaxOutputTokens,
    scope: {
      userId: user.id,
      scopeTable: "onboarding_interviews",
      scopeId: interviewId,
      callPurpose: "onboarding_initial_question",
    },
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
