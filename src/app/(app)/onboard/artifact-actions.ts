"use server";

import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  claimOrphanedArtifacts,
  reassignArtifacts,
  type ReassignResult,
} from "@/lib/onboarding/artifacts/reassign";

// SPEC-3 Phase 4.a: thin server-action wrappers around the pure lib
// primitives. Enforce auth (requireUser) + use the service-role client
// for writes. The lib functions themselves are user-scoped via the
// user_id eq() clause.

export async function reassignArtifactsAction(
  fromInterviewId: string,
  toInterviewId: string,
): Promise<ReassignResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  return reassignArtifacts(svc, user.id, fromInterviewId, toInterviewId);
}

export async function claimOrphanedArtifactsAction(
  toInterviewId: string,
): Promise<ReassignResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  return claimOrphanedArtifacts(svc, user.id, toInterviewId);
}
