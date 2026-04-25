/**
 * Pipeline Workflow — durable wrapper around the existing pipeline runner.
 *
 * Wraps discover → score → research → enrich → draft → recovery as Vercel
 * Workflow steps with crash recovery and retry semantics.
 *
 * Each step calls existing pipeline helpers unchanged. This is a durability
 * migration, not a logic rewrite.
 *
 * Logging: every step receives a `runId` and creates a scoped logger so the
 * full run can be reconstructed by grepping a single ID in Vercel logs.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/service";
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
import { createLogger } from "@/lib/logger";

/* ── Result type ─────────────────────────────────────────────────── */

export interface WorkflowPipelineResult {
  userId: string;
  runId: string;
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

/* ── Step functions — each wraps one pipeline stage ──────────────── */

async function loadConfig(userId: string, runId: string) {
  "use step";
  const log = createLogger({
    runId,
    userId,
    scope: "workflow",
    stage: "loadConfig",
  });
  log.info("loading pipeline config");
  const svc = createSupabaseServiceClient();
  const { data: config, error } = await svc
    .from("pipeline_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`pipeline_config query failed: ${error.message}`);
  }
  if (!config) {
    throw new Error("No pipeline_config row found for user");
  }
  log.info("config loaded");
  return config as PipelineConfigRow;
}

async function stepDiscover(
  userId: string,
  runId: string,
  config: PipelineConfigRow,
): Promise<DiscoverResult> {
  "use step";
  const log = createLogger({
    runId,
    userId,
    scope: "workflow",
    stage: "discover",
  });
  log.info("starting");
  const svc = createSupabaseServiceClient();
  const result = await runDiscover(svc, userId, config, runId);
  log.info("done", { found: result.found, inserted: result.inserted });
  return result;
}

async function stepScore(
  userId: string,
  runId: string,
  config: PipelineConfigRow,
): Promise<ScoreResult> {
  "use step";
  const log = createLogger({
    runId,
    userId,
    scope: "workflow",
    stage: "score",
  });
  log.info("starting");
  const svc = createSupabaseServiceClient();
  const result = await runScore(svc, userId, config, runId);
  log.info("done", {
    processed: result.processed,
    scored: result.scored,
    filtered: result.filtered,
    errors: result.errors,
  });
  return result;
}

async function stepResearch(
  userId: string,
  runId: string,
): Promise<ResearchResult> {
  "use step";
  const log = createLogger({
    runId,
    userId,
    scope: "workflow",
    stage: "research",
  });
  log.info("starting");
  const svc = createSupabaseServiceClient();
  const result = await runResearch(svc, userId);
  log.info("done", {
    processed: result.processed,
    researched: result.researched,
    needsContact: result.needsContact,
    errors: result.errors,
  });
  return result;
}

async function stepEnrich(
  userId: string,
  runId: string,
): Promise<EnrichResult> {
  "use step";
  const log = createLogger({
    runId,
    userId,
    scope: "workflow",
    stage: "enrich",
  });
  log.info("starting");
  const svc = createSupabaseServiceClient();
  const result = await runEnrich(svc, userId);
  log.info("done", {
    processed: result.processed,
    enriched: result.enriched,
    retrying: result.retrying,
    needsContact: result.needsContact,
    errors: result.errors,
  });
  return result;
}

async function stepDraft(userId: string, runId: string): Promise<DraftResult> {
  "use step";
  const log = createLogger({
    runId,
    userId,
    scope: "workflow",
    stage: "draft",
  });
  log.info("starting");
  const svc = createSupabaseServiceClient();
  const result = await runDraft(svc, userId, runId);
  log.info("done", {
    processed: result.processed,
    drafted: result.drafted,
    errors: result.errors,
  });
  return result;
}

async function stepRecoverStranded(
  userId: string,
  runId: string,
): Promise<number> {
  "use step";
  const log = createLogger({
    runId,
    userId,
    scope: "workflow",
    stage: "recoverStranded",
  });
  log.info("starting");
  const svc = createSupabaseServiceClient();
  const stranded = await getOpportunitiesByStage(svc, userId, "drafted", 20);
  let recovered = 0;
  for (const opp of stranded) {
    const advanced = await advanceStage(
      svc,
      opp.id,
      userId,
      "drafted",
      "queued",
      {},
    );
    if (advanced) recovered++;
  }
  log.info("done", { recovered, candidates: stranded.length });
  return recovered;
}

/* ── Main workflow ───────────────────────────────────────────────── */

export async function pipelineWorkflow(
  userId: string,
  runId: string,
): Promise<WorkflowPipelineResult> {
  "use workflow";

  const log = createLogger({ runId, userId, scope: "workflow" });
  log.info("pipeline starting");
  const startedAt = new Date().toISOString();
  let pipelineError: string | null = null;

  // Step 1: Load config
  let config: PipelineConfigRow;
  try {
    config = await loadConfig(userId, runId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown config load failure";
    log.error("loadConfig failed", err);
    return {
      userId,
      runId,
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
      error: message,
    };
  }

  // Step 2: Discover
  let discover: DiscoverResult = { found: 0, inserted: 0 };
  try {
    discover = await stepDiscover(userId, runId, config);
  } catch (err) {
    pipelineError = `discover: ${err instanceof Error ? err.message : String(err)}`;
    log.error("discover failed", err);
  }

  // Step 3: Score
  let score: ScoreResult = { processed: 0, scored: 0, filtered: 0, errors: 0 };
  try {
    score = await stepScore(userId, runId, config);
  } catch (err) {
    pipelineError = `score: ${err instanceof Error ? err.message : String(err)}`;
    log.error("score failed", err);
  }

  // Step 4: Research scored opportunities
  let research: ResearchResult = {
    processed: 0,
    researched: 0,
    needsContact: 0,
    errors: 0,
  };
  try {
    research = await stepResearch(userId, runId);
  } catch (err) {
    pipelineError = `research: ${err instanceof Error ? err.message : String(err)}`;
    log.error("research failed", err);
  }

  // Step 5: Enrich
  let enrich: EnrichResult = {
    processed: 0,
    enriched: 0,
    retrying: 0,
    needsContact: 0,
    errors: 0,
  };
  try {
    enrich = await stepEnrich(userId, runId);
  } catch (err) {
    pipelineError = `enrich: ${err instanceof Error ? err.message : String(err)}`;
    log.error("enrich failed", err);
  }

  // Step 6: Draft
  let draft: DraftResult = { processed: 0, drafted: 0, errors: 0 };
  try {
    draft = await stepDraft(userId, runId);
  } catch (err) {
    pipelineError = `draft: ${err instanceof Error ? err.message : String(err)}`;
    log.error("draft failed", err);
  }

  // Step 7: Recover stranded
  let queuedRecovery = 0;
  try {
    queuedRecovery = await stepRecoverStranded(userId, runId);
  } catch (err) {
    pipelineError = `queued-recovery: ${err instanceof Error ? err.message : String(err)}`;
    log.error("queued-recovery failed", err);
  }

  log.info("pipeline complete", { error: pipelineError });

  return {
    userId,
    runId,
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
