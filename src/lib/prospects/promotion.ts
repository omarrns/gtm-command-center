import type { SupabaseClient } from "@supabase/supabase-js";
import { createOpportunity } from "@/lib/pipeline/opportunities";
import type { PipelineConfigRow } from "@/lib/supabase/types";
import type { ProspectRow } from "./types";

export async function promoteProspectToOpportunity({
  svc,
  userId,
  prospect,
  config,
}: {
  svc: SupabaseClient;
  userId: string;
  prospect: ProspectRow;
  config: Pick<PipelineConfigRow, "score_threshold">;
}): Promise<{ opportunityId: string | null; promoted: boolean }> {
  validatePromotableProspect(prospect, config);

  const created = await createOpportunity(svc, userId, {
    source: "yt_comments",
    external_id: `yt_comments:${prospect.id}`,
    company_name: prospect.company_name ?? prospect.company_domain ?? "Unknown",
    company_domain: prospect.company_domain,
    role_title: null,
    job_description: prospect.comment_text,
    trigger_signals: [buildYoutubeTriggerSignal(prospect)],
    buyer_personas: [],
    prospect_id: prospect.id,
  });

  const { error } = await svc
    .from("prospects")
    .update({ status: "promoted", last_error: null })
    .eq("id", prospect.id)
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to mark prospect promoted: ${error.message}`);

  return { opportunityId: created?.id ?? null, promoted: true };
}

export function validatePromotableProspect(
  prospect: ProspectRow,
  config: Pick<PipelineConfigRow, "score_threshold">,
): void {
  if (prospect.status !== "scored") {
    throw new Error("Only scored prospects can be promoted.");
  }
  if ((prospect.score ?? 0) < config.score_threshold) {
    throw new Error("Prospect score is below the account promotion threshold.");
  }
  if (prospect.company_confidence !== "high" || !prospect.company_domain) {
    throw new Error("Prospect needs high-confidence company linkage before promotion.");
  }
}

function buildYoutubeTriggerSignal(prospect: ProspectRow): Record<string, unknown> {
  return {
    source: "yt_comments",
    prospect_id: prospect.id,
    video_icp_review_id: prospect.video_icp_review_id,
    youtube_author_id: prospect.youtube_author_id,
    youtube_comment_id: prospect.youtube_comment_id,
    comment_text: prospect.comment_text.slice(0, 1000),
    comment_like_count: prospect.comment_like_count,
    comment_timestamp_sec: prospect.comment_timestamp_sec,
    score: prospect.score,
    score_reason:
      typeof prospect.score_components?.reason === "string"
        ? prospect.score_components.reason
        : null,
    discovered_at: prospect.discovered_at,
  };
}
