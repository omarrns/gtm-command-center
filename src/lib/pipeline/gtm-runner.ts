/**
 * GTM Pipeline Runner.
 *
 * Loads pipeline_config + icp_rubric, validates the rubric, then runs:
 *   Phase 2: runDiscoverAccounts  (TheirStack → opportunities)
 *   Phase 3: runScoreAccounts     (Exa + generateObject → analyses, stage advance)
 *
 * research/enrich/draft stay at zero counts until the GTM outbound
 * surface lands — contact enrichment is deferred to a later phase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineConfigRow } from "@/lib/supabase/types";
import type { PipelineRunResult } from "@/lib/pipeline/types";
import { runDiscoverAccounts } from "@/lib/pipeline/steps/discover-accounts";
import { runScoreAccounts } from "@/lib/pipeline/steps/score-accounts";
import type { DiscoverResult } from "@/lib/pipeline/steps/discover";
import type { ScoreResult } from "@/lib/pipeline/steps/score";
import { safeParseIcpRubric } from "@/lib/onboarding/icp-schemas";
import { createLogger, newRunId } from "@/lib/logger";

export async function runGtmPipeline(
  svc: SupabaseClient,
  userId: string,
): Promise<PipelineRunResult> {
  const startedAt = new Date().toISOString();
  const runId = newRunId();
  const log = createLogger({ runId, userId, scope: "gtm-pipeline" });

  const [configRes, scoringRes] = await Promise.all([
    svc.from("pipeline_config").select("*").eq("user_id", userId).maybeSingle(),
    svc
      .from("user_scoring_profiles")
      .select("icp_rubric")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const config = configRes.data as PipelineConfigRow | null;
  const rawRubric = scoringRes.data?.icp_rubric ?? null;

  if (!config) {
    return emptyGtmResult(
      userId,
      startedAt,
      "No pipeline_config found for user",
    );
  }

  if (!rawRubric) {
    return emptyGtmResult(userId, startedAt, "No icp_rubric found for user");
  }

  const parsed = safeParseIcpRubric(rawRubric);
  if (!parsed.success) {
    log.error("icp_rubric failed schema validation", parsed.error);
    return emptyGtmResult(
      userId,
      startedAt,
      `icp_rubric schema validation failed: ${parsed.error.message}`,
    );
  }

  let pipelineError: string | null = null;

  let discover: DiscoverResult = { found: 0, inserted: 0 };
  try {
    discover = await runDiscoverAccounts(svc, userId, parsed.data, runId);
  } catch (err) {
    pipelineError = `discover-accounts: ${err instanceof Error ? err.message : String(err)}`;
    log.error("discover-accounts failed", err);
  }

  let score: ScoreResult = {
    processed: 0,
    scored: 0,
    filtered: 0,
    errors: 0,
    scoredOpportunityIds: [],
  };
  try {
    score = await runScoreAccounts(svc, userId, parsed.data, config, runId);
  } catch (err) {
    pipelineError = `score-accounts: ${err instanceof Error ? err.message : String(err)}`;
    log.error("score-accounts failed", err);
  }

  return {
    userId,
    startedAt,
    completedAt: new Date().toISOString(),
    discover,
    score,
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
    error: pipelineError,
  };
}

function emptyGtmResult(
  userId: string,
  startedAt: string,
  error: string | null,
): PipelineRunResult {
  return {
    userId,
    startedAt,
    completedAt: new Date().toISOString(),
    discover: { found: 0, inserted: 0 },
    score: {
      processed: 0,
      scored: 0,
      filtered: 0,
      errors: 0,
      scoredOpportunityIds: [],
    },
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
    error,
  };
}
