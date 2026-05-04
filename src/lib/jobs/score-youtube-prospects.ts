import type { SupabaseClient } from "@supabase/supabase-js";
import { pokeWorker } from "./poke-worker";

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

  pokeWorker(SCORE_YOUTUBE_PROSPECTS_JOB);
  return { jobId: data.id as string };
}
