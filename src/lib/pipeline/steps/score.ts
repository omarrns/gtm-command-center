/**
 * Pipeline Step: Score
 *
 * Runs full analysis scoring on discovered opportunities.
 * Advances to 'scored' (passes threshold) or 'filtered' (below threshold).
 * Auto-adds high-scoring companies (>= 80) to the watchlist.
 *
 * `scoreOneOpportunity` is the shared primitive used by both the scheduled
 * pipeline and the activation search engine.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRow, PipelineConfigRow } from "@/lib/supabase/types";
import { scoreOpportunity } from "@/lib/pipeline/scoring";
import {
  claimOpportunity,
  releaseOpportunity,
  advanceStage,
  getOpportunitiesByStage,
} from "@/lib/pipeline/opportunities";
import { addToWatchlist } from "@/lib/pipeline/watchlist";

const MAX_SCORES_PER_RUN = 10;
const PIPELINE_MODEL = "claude-sonnet-4-6";

export interface ScoreResult {
  processed: number;
  scored: number;
  filtered: number;
  errors: number;
}

export interface ScoreOneResult {
  newStage: "scored" | "filtered";
  normalizedScore: number;
}

/**
 * Score a single opportunity: run analysis, persist the analysis row, advance
 * the stage, and auto-watchlist at high scores. Throws on any failure so
 * callers can record `last_error` and continue the batch.
 *
 * `source` tags the analysis row so pipeline vs activation origins are
 * distinguishable. `model` is forwarded to the scoring LLM call.
 */
export async function scoreOneOpportunity(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
  config: PipelineConfigRow,
  options?: { source?: string; model?: string },
): Promise<ScoreOneResult> {
  const scoring = await scoreOpportunity(
    opp.company_name,
    opp.role_title ?? "",
    opp.job_description ?? "",
    userId,
    svc,
    options?.model ? { model: options.model } : undefined,
  );

  const { data: analysis, error: analysisError } = await svc
    .from("analyses")
    .insert({
      user_id: userId,
      skill_slug: "full-analysis",
      company_name: opp.company_name,
      role_title: opp.role_title,
      job_description: opp.job_description,
      status: "complete",
      input: {
        company_name: opp.company_name,
        role_title: opp.role_title,
        source: options?.source ?? "pipeline",
      },
      result: scoring.analysisResult,
    })
    .select("id")
    .single();

  if (analysisError) throw analysisError;

  const passesThreshold = scoring.normalizedScore >= config.score_threshold;
  const newStage = passesThreshold ? "scored" : "filtered";

  const advanced = await advanceStage(
    svc,
    opp.id,
    userId,
    "discovered",
    newStage,
    {
      score: scoring.normalizedScore,
      // score_components is persisted for potential future use but currently
      // has no readers — the UI shows the composite score on cards and the
      // full scorecard breakdown lives in analyses.result.
      score_components: {
        jd_fit: scoring.jdFit,
        strategic_fit: scoring.strategicFit,
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

export async function runScore(
  svc: SupabaseClient,
  userId: string,
  config: PipelineConfigRow,
): Promise<ScoreResult> {
  const opportunities = await getOpportunitiesByStage(
    svc,
    userId,
    "discovered",
    MAX_SCORES_PER_RUN,
  );

  const result: ScoreResult = {
    processed: 0,
    scored: 0,
    filtered: 0,
    errors: 0,
  };

  for (const opp of opportunities) {
    try {
      const claimed = await claimOpportunity(svc, opp.id, userId);
      if (!claimed) continue;

      result.processed++;
      const { newStage } = await scoreOneOpportunity(svc, userId, opp, config, {
        source: "pipeline",
        model: PIPELINE_MODEL,
      });

      if (newStage === "scored") result.scored++;
      else result.filtered++;

      await releaseOpportunity(svc, opp.id, userId);
    } catch (err) {
      result.errors++;
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
