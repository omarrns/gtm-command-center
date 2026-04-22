"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getTemplate } from "@/lib/onboarding/templates";
import type { InterviewTemplateId } from "@/lib/onboarding/templates/types";
import { analyzeArtifacts } from "@/lib/onboarding/orchestrator/run";
import { claimOrphanedArtifacts } from "@/lib/onboarding/artifacts/reassign";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";

// SPEC-3 Phase 4.d: explicit pre-confirm persona switch.
//
// Atomic contract — every step must land or the action fails loudly so
// the UI can surface a real error instead of silently losing state:
//
//   1. Verify current interview belongs to the user and is pre-confirm
//      (not confirmed, not abandoned).
//   2. Target template differs from current template.
//   3. Abandon current interview (status → abandoned).
//   4. Detach current's artifacts (interview_id → NULL). FATAL on failure
//      — if detach fails, the subsequent claim won't pick them up and
//      the user thinks their upload moved when it didn't.
//   5. Get-or-create the target-template interview.
//   6. Claim orphans into the target — works whether target was
//      pre-existing (user returning to a prior persona) or fresh.
//   7. Re-run analyzeArtifacts for the target template so the new
//      agent actually sees the preserved artifacts. The orchestrator
//      state on the target gets populated with template-aware
//      dimension inferences.
//   8. Return the target interview row.

const PRE_CONFIRM_STATUSES = [
  "in_progress",
  "extracting",
  "review",
  "story_review",
] as const;

export type SwitchPersonaResult =
  | { ok: true; interview: OnboardingInterviewRow }
  | { ok: false; error: string };

export async function switchPersonaAction(
  currentInterviewId: string,
  targetTemplateId: InterviewTemplateId,
): Promise<SwitchPersonaResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // 1. Load and verify current interview.
  const { data: current, error: currentErr } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("id", currentInterviewId)
    .eq("user_id", user.id)
    .single();

  if (currentErr || !current) {
    return { ok: false, error: "Current interview not found" };
  }

  if (!PRE_CONFIRM_STATUSES.includes(current.status)) {
    return {
      ok: false,
      error: `Can't switch from a ${current.status} interview. Use the reset flow in Settings.`,
    };
  }

  // 2. Disallow no-op switches.
  if (current.template_id === targetTemplateId) {
    return {
      ok: false,
      error: "Already on that persona.",
    };
  }

  const currentRow = current as OnboardingInterviewRow;

  // 3. Abandon current interview.
  const { error: abandonErr } = await svc
    .from("onboarding_interviews")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", currentInterviewId)
    .eq("user_id", user.id);

  if (abandonErr) {
    return { ok: false, error: `Abandon failed: ${abandonErr.message}` };
  }

  // 4. Detach current's artifacts. FATAL for switch (audit finding 4).
  const { error: detachErr } = await svc
    .from("onboarding_artifacts")
    .update({
      interview_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("interview_id", currentInterviewId);

  if (detachErr) {
    return {
      ok: false,
      error: `Couldn't detach artifacts from abandoned interview — switch aborted. ${detachErr.message}`,
    };
  }

  // 5. Get-or-create target interview.
  const targetTemplate = getTemplate(targetTemplateId);

  const { data: existingTarget } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("user_id", user.id)
    .eq("template_id", targetTemplateId)
    .in("status", PRE_CONFIRM_STATUSES as readonly string[])
    .maybeSingle();

  let targetRow: OnboardingInterviewRow;
  if (existingTarget) {
    targetRow = existingTarget as OnboardingInterviewRow;
  } else {
    const { data: created, error: createErr } = await svc
      .from("onboarding_interviews")
      .insert({
        user_id: user.id,
        is_refresh: currentRow.is_refresh,
        template_id: targetTemplateId,
        template_version: targetTemplate.version,
        status: "in_progress",
        messages: [],
        topics_covered: [],
      })
      .select("*")
      .single();

    if (createErr || !created) {
      return {
        ok: false,
        error: `Couldn't create target interview: ${createErr?.message ?? "unknown"}`,
      };
    }
    targetRow = created as OnboardingInterviewRow;
  }

  // 6. Claim orphans into the target — runs whether target is fresh or
  //    pre-existing. Addresses audit finding 3: when target already
  //    exists, the get-or-create early-returns in
  //    getOrCreateInterviewAction and skips the claim.
  const claimed = await claimOrphanedArtifacts(svc, user.id, targetRow.id);
  if (!claimed.ok) {
    return {
      ok: false,
      error: `Artifact claim into target failed: ${claimed.error ?? "unknown"}`,
    };
  }

  // 7. Re-run analyzeArtifacts so the target's orchestrator_state reflects
  //    the newly-attached artifacts under the target template's prompt.
  //    Synchronous — blocks the action until Opus responds. Non-fatal if
  //    it fails: the artifacts are already on the target; a user upload
  //    or manual retry can trigger re-analyze.
  if (targetTemplate.agenticMode) {
    try {
      await analyzeArtifacts(targetRow.id, svc, targetTemplate, {
        isRefresh: currentRow.is_refresh,
      });
    } catch (err) {
      console.error(
        `[switchPersona] analyzeArtifacts failed for target ${targetRow.id}:`,
        err instanceof Error ? err.message : err,
      );
      // Continue — return success with a note. The switch happened;
      // just the inferences didn't refresh.
    }
  }

  // 8. Fetch the final target row (analyze writes orchestrator_state in
  //    place; we want the freshest version).
  const { data: final } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("id", targetRow.id)
    .single();

  revalidatePath("/onboard");
  return {
    ok: true,
    interview: (final ?? targetRow) as OnboardingInterviewRow,
  };
}
