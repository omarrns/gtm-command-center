/**
 * Pipeline Step: Score Accounts (GTM persona).
 *
 * Mirrors runScore's claim → score → advance → release pattern. Writes
 * analyses rows with skill_slug='icp-account-fit' and role_title=NULL.
 * Advances discovered → scored (>= threshold) or filtered (< threshold).
 * Auto-watchlists accounts at normalised score >= 80.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRow, PipelineConfigRow } from "@/lib/supabase/types";
import type { IcpRubric } from "@/lib/pipeline/icp-to-theirstack-filters";
import type { ScoreResult } from "@/lib/pipeline/steps/score";
import {
  claimOpportunity,
  releaseOpportunity,
  advanceStage,
  getOpportunitiesByStage,
} from "@/lib/pipeline/opportunities";
import { addToWatchlist } from "@/lib/pipeline/watchlist";
import { scoreAccountAgainstIcp } from "@/lib/pipeline/scoring-account";
import { createLogger } from "@/lib/logger";

const MAX_SCORES_PER_RUN = 10;
const PIPELINE_MODEL = "claude-sonnet-4-6";

export interface ScoreOneAccountResult {
  newStage: "scored" | "filtered";
  normalizedScore: number;
}

/**
 * Score a single account opportunity and persist analysis + stage
 * advance + (optional) watchlist side effect. Throws on any failure so
 * callers record last_error and continue / return an error response.
 *
 * Shared between runScoreAccounts (batch loop) and the TheirStack
 * webhook handler (single-row real-time path). Does NOT claim or
 * release — callers own the claim lifecycle.
 */
export async function scoreOneAccount(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
  rubric: IcpRubric,
  config: PipelineConfigRow,
  options?: { model?: string; runId?: string },
): Promise<ScoreOneAccountResult> {
  const scoring = await scoreAccountAgainstIcp({
    opp,
    rubric,
    userId,
    svc,
    model: options?.model ?? PIPELINE_MODEL,
    runId: options?.runId,
  });

  const { data: analysis, error: analysisError } = await svc
    .from("analyses")
    .insert({
      user_id: userId,
      skill_slug: "icp-account-fit",
      company_name: opp.company_name,
      role_title: null,
      job_description: opp.job_description,
      status: "complete",
      input: {
        company_name: opp.company_name,
        company_domain: opp.company_domain,
        source: "pipeline",
      },
      result: scoring.analysisResult,
    })
    .select("id")
    .single();

  if (analysisError) throw analysisError;

  const passesThreshold = scoring.normalizedScore >= config.score_threshold;
  const newStage: "scored" | "filtered" = passesThreshold
    ? "scored"
    : "filtered";

  const advanced = await advanceStage(
    svc,
    opp.id,
    userId,
    "discovered",
    newStage,
    {
      score: scoring.normalizedScore,
      score_components: {
        firmo_fit: scoring.analysisResult.firmo_fit.score,
        techno_fit: scoring.analysisResult.techno_fit.score,
        hiring_signal_fit: scoring.analysisResult.hiring_signal_fit.score,
        buyer_fit: scoring.analysisResult.buyer_fit.score,
        proof_point_relevance:
          scoring.analysisResult.proof_point_relevance.score,
        disqualifier_risk: scoring.analysisResult.disqualifier_risk.score,
        tier: scoring.analysisResult.tier,
        verdict: scoring.analysisResult.verdict,
      },
      analysis_id: analysis.id,
    },
  );

  if (!advanced) {
    throw new Error(
      `Stage precondition missed: expected 'discovered' for opportunity ${opp.id}`,
    );
  }

  if (scoring.normalizedScore >= 80) {
    await addToWatchlist(svc, userId, opp.company_name, "auto");
  }

  return { newStage, normalizedScore: scoring.normalizedScore };
}

export async function runScoreAccounts(
  svc: SupabaseClient,
  userId: string,
  rubric: IcpRubric,
  config: PipelineConfigRow,
  runId?: string,
): Promise<ScoreResult> {
  const log = createLogger({ runId, userId, scope: "score-accounts" });

  // Scope the batch to GTM sources at query time so stale jsearch /
  // manual discovered rows can't fill the window and starve the scorer.
  // The belt-and-suspenders check inside the loop is kept as a
  // defensive guardrail in case a caller ever widens this query.
  const opportunities = await getOpportunitiesByStage(
    svc,
    userId,
    "discovered",
    MAX_SCORES_PER_RUN,
    { sources: ["theirstack", "exa-dormant"] },
  );

  const result: ScoreResult = {
    processed: 0,
    scored: 0,
    filtered: 0,
    errors: 0,
  };

  for (const opp of opportunities) {
    if (opp.source !== "theirstack" && opp.source !== "exa-dormant") continue;

    try {
      const claimed = await claimOpportunity(svc, opp.id, userId);
      if (!claimed) continue;

      result.processed++;

      const { newStage } = await scoreOneAccount(
        svc,
        userId,
        opp,
        rubric,
        config,
        {
          model: PIPELINE_MODEL,
          runId,
        },
      );

      if (newStage === "scored") result.scored++;
      else result.filtered++;

      await releaseOpportunity(svc, opp.id, userId);
    } catch (err) {
      result.errors++;
      log.error("account scoring failed", err, { oppId: opp.id });
      await svc
        .from("opportunities")
        .update({
          last_error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", opp.id)
        .eq("user_id", userId);
      await releaseOpportunity(svc, opp.id, userId);
    }
  }

  return result;
}
