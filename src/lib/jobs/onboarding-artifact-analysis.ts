import type { SupabaseClient } from "@supabase/supabase-js";
import { pokeWorker } from "./poke-worker";

export const ONBOARDING_ARTIFACT_ANALYSIS_JOB =
  "onboarding-artifact-analysis";

export interface OnboardingArtifactAnalysisPayload {
  interviewId: string;
  templateId: string;
  isRefresh: boolean;
  analysisRunId: string;
}

export async function enqueueOnboardingArtifactAnalysisJob(
  svc: SupabaseClient,
  {
    userId,
    payload,
  }: {
    userId: string;
    payload: OnboardingArtifactAnalysisPayload;
  },
): Promise<{ jobId: string }> {
  const { data, error } = await svc
    .from("jobs")
    .insert({
      user_id: userId,
      type: ONBOARDING_ARTIFACT_ANALYSIS_JOB,
      payload,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(
      `Failed to enqueue ${ONBOARDING_ARTIFACT_ANALYSIS_JOB}: ${error?.message ?? "no data"}`,
    );
  }

  pokeWorker(ONBOARDING_ARTIFACT_ANALYSIS_JOB);

  return { jobId: data.id as string };
}
