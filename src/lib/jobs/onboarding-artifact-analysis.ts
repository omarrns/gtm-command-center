import type { SupabaseClient } from "@supabase/supabase-js";

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

  pokeWorker().catch(() => {
    /* best-effort */
  });

  return { jobId: data.id as string };
}

async function pokeWorker(): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const invokeSecret = process.env.WORKER_INVOKE_SECRET;
  await fetch(`${appUrl}/api/worker/claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(invokeSecret ? { authorization: `Bearer ${invokeSecret}` } : {}),
    },
    body: JSON.stringify({ types: [ONBOARDING_ARTIFACT_ANALYSIS_JOB] }),
  });
}
