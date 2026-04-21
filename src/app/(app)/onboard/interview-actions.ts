"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runExtractionFromTranscript } from "@/lib/onboarding/extraction";
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

// ── Get or Create Interview ──

export async function getOrCreateInterviewAction(
  isRefresh: boolean,
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
  );

  // Check for existing active interview
  const { data: existing, error: existingErr } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("user_id", user.id)
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

  // Create new interview
  const { data: created, error } = await svc
    .from("onboarding_interviews")
    .insert({
      user_id: user.id,
      is_refresh: isRefresh,
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

  // If already in review/extracting, just return current state (idempotent)
  if (interview.status === "review" || interview.status === "extracting") {
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
    const messages = interview.messages as UIMessage[];
    const extraction = await runExtractionFromTranscript(messages);

    const { data: updated, error: updateErr } = await svc
      .from("onboarding_interviews")
      .update({
        status: "review",
        extracted_profile: extraction.profile,
        extracted_search: extraction.search,
        extracted_outreach: extraction.outreach,
        extracted_insights: extraction.insights,
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

// ── Confirm Interview ──

export async function confirmInterviewAction(
  interviewId: string,
  edits: ConfirmEdits,
): Promise<ActionResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

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
