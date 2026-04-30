import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/supabase/server";
import { CommentSchema, TranscriptSchema } from "@/lib/video-icp/yt-llm";
import {
  loadVideoIcpReview,
  VideoIcpReviewNotFoundError,
} from "@/lib/video-icp/reviews";
import { videoIcpAnalysisSchema } from "@/lib/video-icp/schemas";
import { ReviewPoller } from "../_components/review-poller";
import { ReviewResult } from "../_components/review-result";

type Props = { params: Promise<{ id: string }> };

export default async function VideoIcpDetailPage({ params }: Props) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const svc = createSupabaseServiceClient();

  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.user_type !== "gtm") redirect("/");

  let review;
  try {
    review = await loadVideoIcpReview(svc, user.id, id);
  } catch (err) {
    if (!(err instanceof VideoIcpReviewNotFoundError)) throw err;
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/video-icp"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          Back to Video ICP
        </Link>
        <PageHeader
          title={review.video_title ?? "Video ICP review"}
          description={review.channel_title ?? review.youtube_url}
        />
      </div>

      {review.status === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>Review failed</AlertTitle>
          <AlertDescription>
            {review.error ?? "The worker failed before returning an error."}
          </AlertDescription>
        </Alert>
      ) : review.status === "complete" ? (
        <CompleteReview review={review} />
      ) : (
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <ReviewPoller jobId={review.job_id} />
        </div>
      )}
    </div>
  );
}

function CompleteReview({
  review,
}: {
  review: Awaited<ReturnType<typeof loadVideoIcpReview>>;
}) {
  const analysis = videoIcpAnalysisSchema.parse(review.analysis);
  const transcript = TranscriptSchema.parse(review.transcript);
  const comments = z.array(CommentSchema).nullable().parse(review.comments);

  return (
    <ReviewResult
      analysis={analysis}
      transcript={transcript}
      comments={comments}
      commentsStatus={review.comments_status}
      commentsError={review.comments_error}
    />
  );
}
