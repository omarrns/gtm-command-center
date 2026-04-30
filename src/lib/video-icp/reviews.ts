import type { SupabaseClient } from "@supabase/supabase-js";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import { parseIcpRubric } from "@/lib/onboarding/icp-schemas";
import type {
  VideoIcpCommentsStatus,
  VideoIcpReviewRow,
  VideoIcpReviewStatus,
} from "@/lib/supabase/types";
import type {
  VideoIcpAnalysis,
  VideoIcpComment,
  VideoIcpTranscript,
} from "./schemas";

export class VideoIcpReviewNotFoundError extends Error {
  constructor(reviewId: string) {
    super(`Video ICP review not found: ${reviewId}`);
  }
}

export async function loadVideoIcpReview(
  svc: SupabaseClient,
  userId: string,
  reviewId: string,
): Promise<VideoIcpReviewRow> {
  const { data, error } = await svc
    .from("video_icp_reviews")
    .select("*")
    .eq("id", reviewId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Video ICP review: ${error.message}`);
  }
  if (!data) throw new VideoIcpReviewNotFoundError(reviewId);
  return data as VideoIcpReviewRow;
}

export async function listVideoIcpReviews(
  svc: SupabaseClient,
  userId: string,
): Promise<VideoIcpReviewRow[]> {
  const { data, error } = await svc
    .from("video_icp_reviews")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Failed to load Video ICP reviews: ${error.message}`);
  }
  return (data ?? []) as VideoIcpReviewRow[];
}

export async function loadUserIcpRubric(
  svc: SupabaseClient,
  userId: string,
): Promise<IcpRubric> {
  const { data, error } = await svc
    .from("user_scoring_profiles")
    .select("icp_rubric")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load ICP rubric: ${error.message}`);
  }
  if (!data?.icp_rubric) {
    throw new Error("No confirmed ICP rubric found for this GTM user.");
  }
  return parseIcpRubric(data.icp_rubric);
}

export async function updateVideoIcpReviewStatus(
  svc: SupabaseClient,
  review: VideoIcpReviewRow,
  status: VideoIcpReviewStatus,
  errorMessage?: string,
): Promise<void> {
  const { error } = await svc
    .from("video_icp_reviews")
    .update({ status, error: errorMessage ?? null })
    .eq("id", review.id)
    .eq("user_id", review.user_id);

  if (error) {
    throw new Error(`Failed to update review status: ${error.message}`);
  }
}

export async function completeVideoIcpReview({
  svc,
  review,
  videoId,
  videoTitle,
  channelTitle,
  durationSec,
  transcript,
  comments,
  commentsStatus,
  commentsError,
  analysis,
}: {
  svc: SupabaseClient;
  review: VideoIcpReviewRow;
  videoId: string;
  videoTitle: string;
  channelTitle: string;
  durationSec: number;
  transcript: VideoIcpTranscript;
  comments: VideoIcpComment[] | null;
  commentsStatus: Exclude<VideoIcpCommentsStatus, "not_requested">;
  commentsError: string | null;
  analysis: VideoIcpAnalysis;
}): Promise<void> {
  const { error } = await svc
    .from("video_icp_reviews")
    .update({
      video_id: videoId,
      video_title: videoTitle,
      channel_title: channelTitle,
      duration_sec: Math.round(durationSec),
      status: "complete",
      error: null,
      transcript,
      comments,
      comments_status: commentsStatus,
      comments_error: commentsError,
      analysis,
    })
    .eq("id", review.id)
    .eq("user_id", review.user_id);

  if (error) {
    throw new Error(`Failed to complete Video ICP review: ${error.message}`);
  }
}
