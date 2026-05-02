import type { SupabaseClient } from "@supabase/supabase-js";

export const SCORE_YOUTUBE_PROSPECTS_JOB = "score-youtube-prospects";

export async function enqueueScoreYoutubeProspectsJob(
  svc: SupabaseClient,
  {
    userId,
    reviewId,
  }: {
    userId: string;
    reviewId: string;
  },
): Promise<{ jobId: string }> {
  const { data, error } = await svc
    .from("jobs")
    .insert({
      user_id: userId,
      type: SCORE_YOUTUBE_PROSPECTS_JOB,
      payload: { review_id: reviewId },
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(
      `Failed to enqueue ${SCORE_YOUTUBE_PROSPECTS_JOB}: ${error?.message}`,
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
    body: JSON.stringify({ types: [SCORE_YOUTUBE_PROSPECTS_JOB] }),
  });
}
