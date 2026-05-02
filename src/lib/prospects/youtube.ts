import type { SupabaseClient } from "@supabase/supabase-js";
import type { VideoIcpReviewRow } from "@/lib/supabase/types";
import type { VideoIcpComment } from "@/lib/video-icp/schemas";
import type { ProspectRow } from "./types";

export interface YoutubeProspectSummary {
  insertedOrUpdated: number;
  skippedUploader: number;
}

export async function upsertYoutubeCommentProspects(
  svc: SupabaseClient,
  review: VideoIcpReviewRow,
  comments: VideoIcpComment[] | null,
): Promise<YoutubeProspectSummary> {
  if (!comments || !review.video_id) {
    return { insertedOrUpdated: 0, skippedUploader: 0 };
  }

  const rows = [];
  let skippedUploader = 0;
  for (const comment of comments) {
    if (comment.parentId !== "root" || comment.authorIsUploader) {
      skippedUploader++;
      continue;
    }

    rows.push({
      user_id: review.user_id,
      source: "yt_comments",
      external_id: buildYoutubeProspectExternalId(review.video_id, comment.id),
      video_icp_review_id: review.id,
      display_name: comment.author || "Unknown commenter",
      youtube_author_id: comment.authorId,
      youtube_comment_id: comment.id,
      youtube_channel_url: comment.authorId
        ? `https://www.youtube.com/channel/${comment.authorId}`
        : null,
      company_name: null,
      company_domain: null,
      company_confidence: "none",
      comment_text: comment.text,
      comment_like_count: comment.likeCount,
      comment_timestamp_sec: comment.timestampSec,
      evidence: {
        source: "yt_comments",
        video_id: review.video_id,
        video_title: review.video_title,
        channel_title: review.channel_title,
        youtube_url: review.youtube_url,
        comment_id: comment.id,
      },
    });
  }

  if (rows.length === 0) {
    return { insertedOrUpdated: 0, skippedUploader };
  }

  const { error } = await svc.from("prospects").upsert(rows, {
    onConflict: "user_id,source,external_id",
  });
  if (error) throw new Error(`Failed to upsert YouTube prospects: ${error.message}`);

  return { insertedOrUpdated: rows.length, skippedUploader };
}

export function buildYoutubeProspectExternalId(
  videoId: string,
  commentId: string,
): string {
  return `youtube:${videoId}:${commentId}`;
}

export async function listReviewProspects(
  svc: SupabaseClient,
  userId: string,
  reviewId: string,
): Promise<ProspectRow[]> {
  const { data, error } = await svc
    .from("prospects")
    .select("*")
    .eq("user_id", userId)
    .eq("video_icp_review_id", reviewId)
    .order("score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load review prospects: ${error.message}`);
  return (data ?? []) as ProspectRow[];
}

export async function listProspects(
  svc: SupabaseClient,
  userId: string,
): Promise<ProspectRow[]> {
  const { data, error } = await svc
    .from("prospects")
    .select("*")
    .eq("user_id", userId)
    .order("score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Failed to load prospects: ${error.message}`);
  return (data ?? []) as ProspectRow[];
}
