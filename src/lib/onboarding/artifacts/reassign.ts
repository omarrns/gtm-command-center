// SPEC-3 Phase 4.a: artifact reassignment primitives.
//
// Phase 2.a's migration relaxed the onboarding_artifacts FK to
// ON DELETE SET NULL — so a deleted interview no longer cascades
// and destroys its artifacts. But that only covers the
// delete-cascade case; the explicit persona-switch flow also needs
// to move artifacts from one interview to another without
// destroying the raw content the user just uploaded.
//
// Two primitives:
//
//   reassignArtifacts(svc, userId, from, to) — direct move. Used
//     when the UI knows both interview IDs (e.g., the persona
//     picker flow that abandons interview A and creates B).
//
//   claimOrphanedArtifacts(svc, userId, to) — safety net. Claims
//     any rows with interview_id IS NULL for this user and attaches
//     them to the target. Covers the case where an interview was
//     actually deleted (FK CASCADE from before Phase 2.a or an
//     explicit DELETE).
//
// Both are idempotent + user-scoped. The user_id eq() clause
// prevents a malicious caller from attaching someone else's
// orphaned artifacts.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReassignResult {
  ok: boolean;
  count: number;
  error?: string;
}

export async function reassignArtifacts(
  svc: SupabaseClient,
  userId: string,
  fromInterviewId: string,
  toInterviewId: string,
): Promise<ReassignResult> {
  if (fromInterviewId === toInterviewId) {
    return { ok: true, count: 0 };
  }

  const { data, error } = await svc
    .from("onboarding_artifacts")
    .update({
      interview_id: toInterviewId,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("interview_id", fromInterviewId)
    .select("id");

  if (error) {
    return { ok: false, count: 0, error: error.message };
  }

  return { ok: true, count: data?.length ?? 0 };
}

export async function claimOrphanedArtifacts(
  svc: SupabaseClient,
  userId: string,
  toInterviewId: string,
): Promise<ReassignResult> {
  const { data, error } = await svc
    .from("onboarding_artifacts")
    .update({
      interview_id: toInterviewId,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .is("interview_id", null)
    .select("id");

  if (error) {
    return { ok: false, count: 0, error: error.message };
  }

  return { ok: true, count: data?.length ?? 0 };
}
