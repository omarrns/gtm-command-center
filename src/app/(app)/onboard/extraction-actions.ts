"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { asJson } from "@/lib/supabase/schema";
import { runExtractionFromTranscript } from "@/lib/onboarding/extraction";
import { getTemplate } from "@/lib/onboarding/templates";
import { toConfirmEditsForTemplate } from "@/lib/onboarding/orchestrator/to-confirm-edits";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type { UIMessage } from "ai";

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
  // `extracted` from orchestrator_state here so the review UI has real
  // initial values to render.
  if (interview.status === "review" || interview.status === "extracting") {
    const template = getTemplate(interview.template_id);
    const needsHydration =
      template.agenticMode &&
      interview.status === "review" &&
      interview.extracted === null &&
      interview.orchestrator_state !== null;

    if (needsHydration) {
      const state = interview.orchestrator_state as unknown as OrchestratorState;
      const { edits } = toConfirmEditsForTemplate(state, template);
      const { data: hydrated } = await svc
        .from("onboarding_interviews")
        .update({
          extracted: asJson(edits),
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
    const messages = interview.messages as unknown as UIMessage[];
    const extraction = await runExtractionFromTranscript(messages, template, {
      userId: user.id,
      scopeTable: "onboarding_interviews",
      scopeId: interviewId,
      callPurpose: "extract",
    });

    const { data: updated, error: updateErr } = await svc
      .from("onboarding_interviews")
      .update({
        status: "review",
        extracted: asJson(extraction),
        updated_at: new Date().toISOString(),
      })
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
