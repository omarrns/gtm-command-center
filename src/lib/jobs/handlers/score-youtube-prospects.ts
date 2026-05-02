import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow, PipelineConfigRow } from "@/lib/supabase/types";
import { scoreYoutubeProspectsPayloadSchema } from "@/lib/prospects/schemas";
import { scoreYoutubeProspectsForReview } from "@/lib/prospects/scoring";
import { loadUserIcpRubric } from "@/lib/video-icp/reviews";

export async function runScoreYoutubeProspectsJob(
  job: JobRow,
  svc: SupabaseClient,
): Promise<Record<string, unknown>> {
  const payload = scoreYoutubeProspectsPayloadSchema.parse(job.payload);
  const [rubric, config] = await Promise.all([
    loadUserIcpRubric(svc, job.user_id),
    loadPipelineConfig(svc, job.user_id),
  ]);

  return scoreYoutubeProspectsForReview({
    svc,
    userId: job.user_id,
    reviewId: payload.review_id,
    rubric,
    config,
    runId: job.id,
  });
}

async function loadPipelineConfig(
  svc: SupabaseClient,
  userId: string,
): Promise<PipelineConfigRow> {
  const { data, error } = await svc
    .from("pipeline_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load pipeline config: ${error.message}`);
  if (!data) throw new Error("No pipeline config found for this GTM user.");
  return data as PipelineConfigRow;
}
