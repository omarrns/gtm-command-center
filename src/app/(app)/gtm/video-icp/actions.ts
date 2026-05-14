"use server";

import { redirect } from "next/navigation";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/supabase/server";
import { videoIcpSubmitSchema } from "@/lib/video-icp/schemas";

export interface VideoIcpFormState {
  error: string | null;
}

export async function createVideoIcpReviewAction(
  _prevState: VideoIcpFormState,
  formData: FormData,
): Promise<VideoIcpFormState> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: profile, error: profileError } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) return { error: profileError.message };
  if (profile?.user_type !== "gtm") {
    return { error: "Video ICP is only available for GTM users." };
  }

  const parsed = videoIcpSubmitSchema.safeParse({
    youtubeUrl: formData.get("youtube_url"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid YouTube URL." };
  }

  const { data: review, error: reviewError } = await svc
    .from("video_icp_reviews")
    .insert({
      user_id: user.id,
      youtube_url: parsed.data.youtubeUrl,
      status: "pending",
      comments_status: "not_requested",
    })
    .select("id")
    .single();

  if (reviewError || !review) {
    return {
      error: reviewError?.message ?? "Failed to create Video ICP review.",
    };
  }

  const { jobId } = await enqueueJob({
    userId: user.id,
    type: "video-icp-review",
    payload: { review_id: review.id },
  });

  const { error: linkError } = await svc
    .from("video_icp_reviews")
    .update({ job_id: jobId })
    .eq("id", review.id)
    .eq("user_id", user.id);

  if (linkError) {
    throw new Error(`Failed to link Video ICP job: ${linkError.message}`);
  }

  redirect(`/gtm/video-icp/${review.id}`);
}
