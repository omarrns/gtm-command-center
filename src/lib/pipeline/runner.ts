/**
 * Pipeline Runner — orchestrates discover -> score -> research -> enrich -> draft.
 *
 * Called by the cron endpoint (all users) and manual trigger (single user).
 * Each stage processes a batch with per-opportunity error isolation.
 * Pipeline runs within a single Vercel Function invocation (up to 300s).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineConfigRow } from "@/lib/supabase/types";
import {
  runDiscover,
  type DiscoverResult,
} from "@/lib/pipeline/steps/discover";
import { runScore, type ScoreResult } from "@/lib/pipeline/steps/score";
import {
  runResearch,
  type ResearchResult,
} from "@/lib/pipeline/steps/research";
import { runEnrich, type EnrichResult } from "@/lib/pipeline/steps/enrich";
import { runDraft, type DraftResult } from "@/lib/pipeline/steps/draft";
import {
  getOpportunitiesByStage,
  advanceStage,
} from "@/lib/pipeline/opportunities";

export interface PipelineRunResult {
  userId: string;
  startedAt: string;
  completedAt: string;
  discover: DiscoverResult;
  score: ScoreResult;
  research: ResearchResult;
  enrich: EnrichResult;
  draft: DraftResult;
  queuedRecovery: number;
  error: string | null;
}

export async function runPipeline(
  svc: SupabaseClient,
  userId: string,
): Promise<PipelineRunResult> {
  const startedAt = new Date().toISOString();

  // Load pipeline config for user
  const { data: config, error: configError } = await svc
    .from("pipeline_config")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (configError || !config) {
    return emptyResult(userId, startedAt, "No pipeline_config found for user");
  }

  const typedConfig = config as PipelineConfigRow;
  let pipelineError: string | null = null;

  // Stage 1: Discover new roles
  let discover: DiscoverResult = { found: 0, inserted: 0 };
  try {
    discover = await runDiscover(svc, userId, typedConfig);
  } catch (err) {
    pipelineError = `discover: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Stage 2: Score discovered opportunities
  let score: ScoreResult = { processed: 0, scored: 0, filtered: 0, errors: 0 };
  try {
    score = await runScore(svc, userId, typedConfig);
  } catch (err) {
    pipelineError = `score: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Stage 3: Research scored opportunities
  let research: ResearchResult = {
    processed: 0,
    researched: 0,
    needsContact: 0,
    errors: 0,
  };
  try {
    research = await runResearch(svc, userId);
  } catch (err) {
    pipelineError = `research: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Stage 4: Enrich researched opportunities (email discovery)
  let enrich: EnrichResult = {
    processed: 0,
    enriched: 0,
    retrying: 0,
    needsContact: 0,
    errors: 0,
  };
  try {
    enrich = await runEnrich(svc, userId);
  } catch (err) {
    pipelineError = `enrich: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Stage 5: Draft emails for enriched opportunities
  let draft: DraftResult = { processed: 0, drafted: 0, errors: 0 };
  try {
    draft = await runDraft(svc, userId);
  } catch (err) {
    pipelineError = `draft: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Stage 6: Recovery — advance any stranded 'drafted' rows to 'queued'.
  // This handles rows that got stuck if the function timed out between
  // the enriched->drafted and drafted->queued transitions.
  let queuedRecovery = 0;
  try {
    const stranded = await getOpportunitiesByStage(svc, userId, "drafted", 20);
    for (const opp of stranded) {
      const advanced = await advanceStage(
        svc,
        opp.id,
        userId,
        "drafted",
        "queued",
        {},
      );
      if (advanced) queuedRecovery++;
    }
  } catch (err) {
    pipelineError = `queued-recovery: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    userId,
    startedAt,
    completedAt: new Date().toISOString(),
    discover,
    score,
    research,
    enrich,
    draft,
    queuedRecovery,
    error: pipelineError,
  };
}

function emptyResult(
  userId: string,
  startedAt: string,
  error: string,
): PipelineRunResult {
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
    error,
  };
}
