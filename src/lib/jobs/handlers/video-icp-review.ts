import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS } from "@/lib/ai/anthropic";
import { runGenerateObject } from "@/lib/ai/calls";
import { enqueueScoreYoutubeProspectsJob } from "@/lib/jobs/score-youtube-prospects";
import { upsertYoutubeCommentProspects } from "@/lib/prospects/youtube";
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
  const system = buildVideoIcpReviewSystem(sender);
  const prompt = buildVideoIcpReviewPrompt({
    rubric,
    video: extraction.meta,
    paragraphs: extraction.transcript.paragraphs,
  });
  const analysis = await runVideoIcpAnalysis({
    userId: job.user_id,
    reviewId: review.id,
    system,
    prompt,
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

  const prospectSummary = await upsertYoutubeCommentProspects(
    svc,
    {
      ...review,
      video_id: extraction.source.id,
      video_title: extraction.meta.title,
      channel_title: extraction.meta.channel,
    },
    extraction.comments,
  );
  if (prospectSummary.insertedOrUpdated > 0) {
    await enqueueScoreYoutubeProspectsJob(svc, {
      userId: job.user_id,
      reviewId: review.id,
    });
  }

  return {
    review_id: review.id,
    video_id: extraction.source.id,
    comments_status: extraction.commentsStatus,
    prospects: prospectSummary,
  };
}

export async function runVideoIcpAnalysis({
  userId,
  reviewId,
  system,
  prompt,
}: {
  userId: string;
  reviewId: string;
  system: string;
  prompt: string;
}) {
  const scope = {
    userId,
    scopeTable: "video_icp_reviews",
    scopeId: reviewId,
  };

  try {
    return await runGenerateObject({
      model: MODELS.videoIcpReview,
      system,
      prompt,
      schema: videoIcpAnalysisSchema,
      scope: {
        ...scope,
        callPurpose: "video-icp-review",
      },
    });
  } catch (primaryError) {
    try {
      return await runGenerateObject({
        model: MODELS.videoIcpReviewFallback,
        system,
        prompt,
        schema: videoIcpAnalysisSchema,
        structuredOutputMode: "jsonTool",
        scope: {
          ...scope,
          callPurpose: "video-icp-review-fallback",
        },
      });
    } catch (fallbackError) {
      throw new Error(
        `Video ICP analysis failed on primary and fallback models. Primary: ${formatError(primaryError)}. Fallback: ${formatError(fallbackError)}`,
        { cause: fallbackError },
      );
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
