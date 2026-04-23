"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getTemplate } from "@/lib/onboarding/templates";
import type {
  InterviewTemplate,
  InterviewTemplateId,
} from "@/lib/onboarding/templates/types";
import { analyzeArtifacts } from "@/lib/onboarding/orchestrator/run";
import {
  claimOrphanedArtifacts,
  reassignArtifacts,
} from "@/lib/onboarding/artifacts/reassign";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";

// SPEC-3 Phase 4.d / 4.e: explicit pre-confirm persona switch.
//
// Recovery contract (not a transaction — Supabase JS doesn't give us one,
// but ordering keeps each step individually retryable and fail-safe):
//
//   1. Verify ownership + pre-confirm status on the source interview.
//   2. Verify target template differs from source.
//   3. Get-or-create the target interview. Failure here touches no state
//      downstream, so retry is safe.
//   4. Reassign source → target (explicit, not null-then-claim). If this
//      fails, source is still in its original state; user can retry.
//   5. Claim any other orphaned artifacts for this user into target
//      (catch-all for artifacts detached by earlier flows).
//   6. Abandon source. If this fails, the source stays active with no
//      artifacts attached — retry of switch is a no-op reassign + second
//      abandon attempt. No data loss.
//   7. Re-run analyzeArtifacts for the target template so the new agent
//      actually sees the moved artifacts. FAILURE IS VISIBLE — the
//      action still returns ok with analysisFailed=true so the UI can
//      surface a warning and the user can retry (e.g., upload another
//      artifact to re-trigger analyze, or call reanalyze directly).
//   8. Return the target interview row plus analysis status.

const PRE_CONFIRM_STATUSES = [
  "in_progress",
  "extracting",
  "review",
  "story_review",
] as const;

export type SwitchPersonaResult =
  | {
      ok: true;
      interview: OnboardingInterviewRow;
      analysisFailed?: boolean;
      analysisError?: string;
    }
  | { ok: false; error: string };

// Testable core — no server-action wrappers (requireUser / revalidatePath).
// Scripts can exercise this with a service-role client and a known userId.
export async function performPersonaSwitch(
  svc: SupabaseClient,
  userId: string,
  currentInterviewId: string,
  targetTemplateId: InterviewTemplateId,
): Promise<SwitchPersonaResult> {
  // 1. Load and verify source.
  const { data: current, error: currentErr } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("id", currentInterviewId)
    .eq("user_id", userId)
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
    return { ok: false, error: "Already on that persona." };
  }

  const currentRow = current as OnboardingInterviewRow;

  // 3. Get-or-create the target first — if this fails nothing has changed
  //    on the source yet so retry is safe.
  const targetTemplate = getTemplate(targetTemplateId);
  const targetRow = await getOrCreateTarget(
    svc,
    userId,
    targetTemplateId,
    targetTemplate,
    currentRow.is_refresh,
  );
  if ("error" in targetRow) return { ok: false, error: targetRow.error };

  // 4. Reassign source's artifacts directly to the target. Explicit
  //    source→target move (no null-then-claim intermediate state).
  const reassigned = await reassignArtifacts(
    svc,
    userId,
    currentInterviewId,
    targetRow.row.id,
  );
  if (!reassigned.ok) {
    return {
      ok: false,
      error:
        `Couldn't move artifacts to target — source is unchanged; retry. ${reassigned.error ?? ""}`.trim(),
    };
  }

  // 5. Catch-all: claim any orphans from elsewhere.
  const claimed = await claimOrphanedArtifacts(svc, userId, targetRow.row.id);
  if (!claimed.ok) {
    return {
      ok: false,
      error: `Orphan claim into target failed: ${claimed.error ?? "unknown"}`,
    };
  }

  // 6. Abandon source. If this fails, source stays active but artifacts
  //    are already on target — a retry is safe (step 4 no-ops with zero
  //    rows, and abandon re-runs). Surface a soft warning instead of
  //    failing the whole switch.
  const { error: abandonErr } = await svc
    .from("onboarding_interviews")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", currentInterviewId)
    .eq("user_id", userId);

  if (abandonErr) {
    console.error(
      `[performPersonaSwitch] abandon failed for source ${currentInterviewId}:`,
      abandonErr.message,
    );
    // Fall through — the switch is effectively done from the user's POV.
  }

  // 7. Re-run analyzeArtifacts so the target's orchestrator_state
  //    reflects the newly-attached artifacts. FAILURE IS REPORTED — the
  //    switch succeeded at the data level (artifacts are on target,
  //    source is abandoned) but the new agent won't have fresh
  //    inferences until analyze retries.
  let analysisFailed = false;
  let analysisError: string | undefined;

  if (targetTemplate.agenticMode) {
    try {
      await analyzeArtifacts(targetRow.row.id, svc, targetTemplate, {
        isRefresh: currentRow.is_refresh,
      });
    } catch (err) {
      analysisFailed = true;
      analysisError = err instanceof Error ? err.message : String(err);
      console.error(
        `[performPersonaSwitch] analyzeArtifacts failed for target ${targetRow.row.id}:`,
        analysisError,
      );
    }
  }

  // 8. Fetch the final target row (analyze writes orchestrator_state in
  //    place; caller gets the freshest version).
  const { data: final } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("id", targetRow.row.id)
    .single();

  return {
    ok: true,
    interview: (final ?? targetRow.row) as OnboardingInterviewRow,
    ...(analysisFailed ? { analysisFailed, analysisError } : {}),
  };
}

async function getOrCreateTarget(
  svc: SupabaseClient,
  userId: string,
  targetTemplateId: InterviewTemplateId,
  targetTemplate: InterviewTemplate,
  isRefresh: boolean,
): Promise<{ row: OnboardingInterviewRow } | { error: string }> {
  const { data: existing } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("user_id", userId)
    .eq("template_id", targetTemplateId)
    .in("status", PRE_CONFIRM_STATUSES as readonly string[])
    .maybeSingle();

  if (existing) return { row: existing as OnboardingInterviewRow };

  const { data: created, error: createErr } = await svc
    .from("onboarding_interviews")
    .insert({
      user_id: userId,
      is_refresh: isRefresh,
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
      error: `Couldn't create target interview: ${createErr?.message ?? "unknown"}`,
    };
  }

  return { row: created as OnboardingInterviewRow };
}

// Thin server-action wrapper: auth + revalidate + delegate to lib.
export async function switchPersonaAction(
  currentInterviewId: string,
  targetTemplateId: InterviewTemplateId,
): Promise<SwitchPersonaResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const result = await performPersonaSwitch(
    svc,
    user.id,
    currentInterviewId,
    targetTemplateId,
  );
  if (result.ok) {
    revalidatePath("/onboard");
  }
  return result;
}
