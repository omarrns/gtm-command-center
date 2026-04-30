import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS } from "@/lib/ai/anthropic";
import { runGenerateObject } from "@/lib/ai/calls";
import type { JobRow } from "@/lib/supabase/types";
import { loadMemoryContext } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import {
  buildVideoIcpReviewPrompt,
  buildVideoIcpReviewSystem,
} from "@/lib/skills/prompts/video-icp-review";
import { extractVideoIcpBundle } from "@/lib/video-icp/extract";
import {
  completeVideoIcpReview,
  loadUserIcpRubric,
  loadVideoIcpReview,
  updateVideoIcpReviewStatus,
} from "@/lib/video-icp/reviews";
import {
  videoIcpAnalysisSchema,
  videoIcpJobPayloadSchema,
} from "@/lib/video-icp/schemas";

export async function runVideoIcpReviewJob(
  job: JobRow,
  svc: SupabaseClient,
): Promise<Record<string, unknown>> {
  const payload = videoIcpJobPayloadSchema.parse(job.payload);
  const review = await loadVideoIcpReview(svc, job.user_id, payload.review_id);

  await updateVideoIcpReviewStatus(svc, review, "running");

  const [extraction, rubric, memoryCtx] = await Promise.all([
    extractVideoIcpBundle(review.youtube_url),
    loadUserIcpRubric(svc, job.user_id),
    loadMemoryContext(job.user_id, svc),
  ]);

  const sender = extractSenderIdentity(memoryCtx, memoryCtx.displayName);
  const analysis = await runGenerateObject({
    model: MODELS.sonnet,
    system: buildVideoIcpReviewSystem(sender),
    prompt: buildVideoIcpReviewPrompt({
      rubric,
      video: extraction.meta,
      paragraphs: extraction.transcript.paragraphs,
    }),
    schema: videoIcpAnalysisSchema,
    structuredOutputMode: "jsonTool",
    scope: {
      userId: job.user_id,
      scopeTable: "video_icp_reviews",
      scopeId: review.id,
      callPurpose: "video-icp-review",
    },
  });

  await completeVideoIcpReview({
    svc,
    review,
    videoId: extraction.source.id,
    videoTitle: extraction.meta.title,
    channelTitle: extraction.meta.channel,
    durationSec: extraction.meta.durationSec,
    transcript: extraction.transcript,
    comments: extraction.comments,
    commentsStatus: extraction.commentsStatus,
    commentsError: extraction.commentsError,
    analysis,
  });

  return {
    review_id: review.id,
    video_id: extraction.source.id,
    comments_status: extraction.commentsStatus,
  };
}
