/**
 * GTM Pipeline Runner — stub.
 *
 * Phase 1 spine only: loads pipeline_config + icp_rubric, logs a
 * structured no-op, returns a PipelineRunResult with zero counts.
 *
 * Phase 2 wires runDiscoverAccounts (TheirStack). Phase 3 wires
 * runScoreAccounts (Exa + generateObject). Until then this branch is
 * intentionally inert so the persona-routed runner can ship without
 * producing rows for GTM users whose downstream stages don't exist yet.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineConfigRow } from "@/lib/supabase/types";
import type { PipelineRunResult } from "@/lib/pipeline/runner";

export async function runGtmPipeline(
  svc: SupabaseClient,
  userId: string,
): Promise<PipelineRunResult> {
  const startedAt = new Date().toISOString();

  const [configRes, scoringRes] = await Promise.all([
    svc.from("pipeline_config").select("*").eq("user_id", userId).maybeSingle(),
    svc
      .from("user_scoring_profiles")
      .select("icp_rubric")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const config = configRes.data as PipelineConfigRow | null;
  const rubric = (scoringRes.data?.icp_rubric ?? null) as Record<
    string,
    unknown
  > | null;

  console.log(
    `[gtm-pipeline] no-op run for user=${userId} config=${!!config} rubric=${!!rubric} (Phase 2+ wires TheirStack discovery)`,
  );

  return emptyGtmResult(userId, startedAt);
}

function emptyGtmResult(userId: string, startedAt: string): PipelineRunResult {
  return {
    userId,
    startedAt,
    completedAt: new Date().toISOString(),
    discover: { found: 0, inserted: 0 },
    score: { processed: 0, scored: 0, filtered: 0, errors: 0 },
    research: { processed: 0, researched: 0, needsContact: 0, errors: 0 },
    enrich: {
      processed: 0,
      enriched: 0,
      retrying: 0,
      needsContact: 0,
      errors: 0,
    },
    draft: { processed: 0, drafted: 0, errors: 0 },
    queuedRecovery: 0,
    error: null,
  };
}
