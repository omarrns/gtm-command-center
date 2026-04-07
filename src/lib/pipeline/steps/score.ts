/**
 * Pipeline Step: Score
 *
 * Runs full analysis scoring on discovered opportunities.
 * Advances to 'scored' (passes threshold) or 'filtered' (below threshold).
 * Auto-adds high-scoring companies (>= 80) to the watchlist.
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

const MAX_SCORES_PER_RUN = 5;

export interface ScoreResult {
  processed: number;
  scored: number;
  filtered: number;
  errors: number;
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
      await processOneScore(svc, userId, opp, config);

      // Re-read to check the final stage
      const { data: updated } = await svc
        .from("opportunities")
        .select("stage, score")
        .eq("id", opp.id)
        .single();

      if (updated?.stage === "scored") result.scored++;
      else if (updated?.stage === "filtered") result.filtered++;

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

async function processOneScore(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
  config: PipelineConfigRow,
): Promise<void> {
  const scoring = await scoreOpportunity(
    opp.company_name,
    opp.role_title,
    opp.job_description ?? "",
    userId,
    svc,
  );

  // Create analyses row and link to opportunity
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
        source: "pipeline",
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

  // Auto-add to watchlist if score >= 80
  if (scoring.normalizedScore >= 80) {
    await svc
      .from("watchlist")
      .upsert(
        { user_id: userId, company_name: opp.company_name, source: "auto" },
        { onConflict: "user_id,company_name", ignoreDuplicates: true },
      );
  }
}
