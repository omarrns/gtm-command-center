import type { SupabaseClient } from "@supabase/supabase-js";

export interface OnboardingStatus {
  complete: boolean;
  completedSteps: number[];
}

/**
 * Checks whether onboarding is complete by verifying the existence of
 * the three records the pipeline depends on:
 *   Step 1: memory_documents with document_key = 'user_profile'
 *   Step 2: pipeline_config row
 *   Step 3: memory_documents with document_key = 'feedback_outreach_style'
 *
 * Step 4 (Gmail) is optional and not required for the gate.
 */
export async function isOnboardingComplete(
  svc: SupabaseClient,
  userId: string,
): Promise<OnboardingStatus> {
  const [profileRes, configRes, outreachRes] = await Promise.all([
    svc
      .from("memory_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("document_key", "user_profile"),
    svc
      .from("pipeline_config")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    svc
      .from("memory_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("document_key", "feedback_outreach_style"),
  ]);

  const completedSteps: number[] = [];
  if ((profileRes.count ?? 0) > 0) completedSteps.push(1);
  if ((configRes.count ?? 0) > 0) completedSteps.push(2);
  if ((outreachRes.count ?? 0) > 0) completedSteps.push(3);

  return {
    complete: completedSteps.length === 3,
    completedSteps,
  };
}
