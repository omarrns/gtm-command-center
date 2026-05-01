"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getTemplate } from "@/lib/onboarding/templates";
import type { InterviewTemplateId } from "@/lib/onboarding/templates/types";
import type { JobSearchEdits } from "@/lib/onboarding/templates/job-search";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

// ── Story Phase (agentic only — stream insights then confirm) ──

// Transition review → story_review. Persists the user's review-screen edits
// to the unified `extracted` column (what performConfirm reads).
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

export async function startIcpNarrativeAction(
  interviewId: string,
  edits: IcpEdits,
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
    product: edits.product,
    icp: edits.icp,
    proof_points: edits.proof_points,
    evidence: edits.evidence,
  };

  const { data: updated, error: updateErr } = await svc
    .from("onboarding_interviews")
    .update({
      status: "story_review",
      extracted: updatedExtracted,
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
