/**
 * Pipeline Workflow — durable wrapper around the existing pipeline runner.
 *
 * Phase 13A: wraps discover → score → research → enrich → draft → recovery
 * as Vercel Workflow steps with crash recovery and retry semantics.
 * Phase 13B: adds pursuit planner step between score and research.
 *
 * Each step calls existing pipeline helpers unchanged. This is a durability
 * migration, not a logic rewrite.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { PipelineConfigRow, OpportunityRow } from "@/lib/supabase/types";
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
import {
  planPursuit,
  type PursuitPlan,
  type PlannerContext,
} from "@/lib/pipeline/pursuit/planner";
import {
  executePlans,
  type ExecutorResult,
} from "@/lib/pipeline/pursuit/execute-plan";
import { loadMemoryContext } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";

/* ── Result type (matches runner.ts) ─────────────────────────────── */

export interface PursuitPlanEntry {
  opportunityId: string;
  companyName: string;
  score: number | null;
  plan: PursuitPlan;
}

export interface WorkflowPipelineResult {
  userId: string;
  startedAt: string;
  completedAt: string;
  discover: DiscoverResult;
  score: ScoreResult;
  pursuitPlans: PursuitPlanEntry[];
  research: ResearchResult;
  enrich: EnrichResult;
  draft: DraftResult;
  queuedRecovery: number;
  error: string | null;
}

/* ── Step functions — each wraps one pipeline stage ──────────────── */

async function loadConfig(userId: string) {
  "use step";
  console.log(`[workflow] loadConfig: userId=${userId}`);
  const svc = createSupabaseServiceClient();
  const { data: config, error } = await svc
    .from("pipeline_config")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !config) {
    throw new Error("No pipeline_config found for user");
  }
  console.log(`[workflow] loadConfig: done`);
  return config as PipelineConfigRow;
}

async function stepDiscover(
  userId: string,
  config: PipelineConfigRow,
): Promise<DiscoverResult> {
  "use step";
  console.log(`[workflow] discover: starting`);
  const svc = createSupabaseServiceClient();
  const result = await runDiscover(svc, userId, config);
  console.log(
    `[workflow] discover: found=${result.found} inserted=${result.inserted}`,
  );
  return result;
}

async function stepScore(
  userId: string,
  config: PipelineConfigRow,
): Promise<ScoreResult> {
  "use step";
  console.log(`[workflow] score: starting`);
  const svc = createSupabaseServiceClient();
  const result = await runScore(svc, userId, config);
  console.log(
    `[workflow] score: scored=${result.scored} filtered=${result.filtered}`,
  );
  return result;
}

async function stepResearch(userId: string): Promise<ResearchResult> {
  "use step";
  console.log(`[workflow] research: starting`);
  const svc = createSupabaseServiceClient();
  const result = await runResearch(svc, userId);
  console.log(
    `[workflow] research: researched=${result.researched} needsContact=${result.needsContact}`,
  );
  return result;
}

async function stepEnrich(userId: string): Promise<EnrichResult> {
  "use step";
  console.log(`[workflow] enrich: starting`);
  const svc = createSupabaseServiceClient();
  const result = await runEnrich(svc, userId);
  console.log(
    `[workflow] enrich: enriched=${result.enriched} needsContact=${result.needsContact}`,
  );
  return result;
}

async function stepDraft(userId: string): Promise<DraftResult> {
  "use step";
  console.log(`[workflow] draft: starting`);
  const svc = createSupabaseServiceClient();
  const result = await runDraft(svc, userId);
  console.log(`[workflow] draft: drafted=${result.drafted}`);
  return result;
}

async function stepRecoverStranded(userId: string): Promise<number> {
  "use step";
  console.log(`[workflow] recoverStranded: starting`);
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
  console.log(`[workflow] recoverStranded: recovered=${recovered}`);
  return recovered;
}

const MAX_PURSUITS_PER_RUN = 5;

/**
 * Plan pursuit strategy for scored opportunities.
 * Loads each opportunity's analysis, sender identity, and scoring profile,
 * then calls the planner for a structured strategy decision.
 */
async function stepPlanPursuits(
  userId: string,
  config: PipelineConfigRow,
): Promise<PursuitPlanEntry[]> {
  "use step";
  console.log(`[workflow] planPursuits: starting`);
  const svc = createSupabaseServiceClient();

  // Get scored opportunities ready for pursuit
  const scored = await getOpportunitiesByStage(
    svc,
    userId,
    "scored",
    MAX_PURSUITS_PER_RUN,
  );

  if (scored.length === 0) {
    console.log(`[workflow] planPursuits: no scored opportunities`);
    return [];
  }

  // Load shared context once
  const [memoryCtx, scoringProfile] = await Promise.all([
    loadMemoryContext(userId, svc),
    svc
      .from("user_scoring_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then((r) => r.data),
  ]);
  const sender = extractSenderIdentity(memoryCtx, memoryCtx.displayName);

  const plans: PursuitPlanEntry[] = [];

  for (const opp of scored) {
    try {
      // Load analysis result for this opportunity
      let analysisResult: Record<string, unknown> = {};
      if (opp.analysis_id) {
        const { data: analysis } = await svc
          .from("analyses")
          .select("result")
          .eq("id", opp.analysis_id)
          .single();
        if (analysis?.result) {
          analysisResult = analysis.result as Record<string, unknown>;
        }
      }

      const ctx: PlannerContext = {
        opportunity: opp as OpportunityRow,
        analysisResult,
        sender,
        scoreThreshold: config.score_threshold,
        scoringProfile,
      };

      const plan = await planPursuit(ctx);
      plans.push({
        opportunityId: opp.id,
        companyName: opp.company_name,
        score: opp.score,
        plan,
      });
      console.log(
        `[workflow] planPursuits: ${opp.company_name} → ${plan.mode} (${plan.target_contact}, confidence=${plan.confidence})`,
      );
    } catch (err) {
      console.log(
        `[workflow] planPursuits: error planning ${opp.company_name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(
    `[workflow] planPursuits: planned ${plans.length}/${scored.length} opportunities`,
  );
  return plans;
}

/**
 * Execute pursuit plans — skip bad opportunities, research good ones.
 * Opportunities that pass research will be picked up by enrich + draft steps.
 */
async function stepExecutePlans(
  userId: string,
  plans: PursuitPlanEntry[],
): Promise<ExecutorResult> {
  "use step";
  console.log(`[workflow] executePlans: starting with ${plans.length} plans`);
  const svc = createSupabaseServiceClient();
  const result = await executePlans(svc, userId, plans);
  console.log(
    `[workflow] executePlans: researched=${result.researched} skipped=${result.skipped} needsContact=${result.needsContact} errors=${result.errors}`,
  );
  return result;
}

/* ── Main workflow ───────────────────────────────────────────────── */

export async function pipelineWorkflow(
  userId: string,
): Promise<WorkflowPipelineResult> {
  "use workflow";

  console.log(`[workflow] pipelineWorkflow: starting for userId=${userId}`);
  const startedAt = new Date().toISOString();
  let pipelineError: string | null = null;

  // Step 1: Load config
  let config: PipelineConfigRow;
  try {
    config = await loadConfig(userId);
  } catch {
    return {
      userId,
      startedAt,
      completedAt: new Date().toISOString(),
      discover: { found: 0, inserted: 0 },
      score: { processed: 0, scored: 0, filtered: 0, errors: 0 },
      pursuitPlans: [],
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
      error: "No pipeline_config found for user",
    };
  }

  // Step 2: Discover
  let discover: DiscoverResult = { found: 0, inserted: 0 };
  try {
    discover = await stepDiscover(userId, config);
  } catch (err) {
    pipelineError = `discover: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Step 3: Score
  let score: ScoreResult = { processed: 0, scored: 0, filtered: 0, errors: 0 };
  try {
    score = await stepScore(userId, config);
  } catch (err) {
    pipelineError = `score: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Step 3.5: Plan pursuit strategy for scored opportunities
  let pursuitPlans: PursuitPlanEntry[] = [];
  try {
    pursuitPlans = await stepPlanPursuits(userId, config);
  } catch (err) {
    pipelineError = `pursuit-planner: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Step 3.6: Execute pursuit plans (skip bad opps, research good ones)
  // Executor advances planned opps to researched/skipped/needs_contact.
  // Any remaining scored opps (unplanned) fall through to the legacy research step.
  if (pursuitPlans.length > 0) {
    try {
      await stepExecutePlans(userId, pursuitPlans);
    } catch (err) {
      pipelineError = `pursuit-executor: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Step 4: Research (handles any scored opps NOT covered by the executor)
  let research: ResearchResult = {
    processed: 0,
    researched: 0,
    needsContact: 0,
    errors: 0,
  };
  try {
    research = await stepResearch(userId);
  } catch (err) {
    pipelineError = `research: ${err instanceof Error ? err.message : String(err)}`;
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
    enrich = await stepEnrich(userId);
  } catch (err) {
    pipelineError = `enrich: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Step 6: Draft
  let draft: DraftResult = { processed: 0, drafted: 0, errors: 0 };
  try {
    draft = await stepDraft(userId);
  } catch (err) {
    pipelineError = `draft: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Step 7: Recover stranded
  let queuedRecovery = 0;
  try {
    queuedRecovery = await stepRecoverStranded(userId);
  } catch (err) {
    pipelineError = `queued-recovery: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    userId,
    startedAt,
    completedAt: new Date().toISOString(),
    discover,
    score,
    pursuitPlans,
    research,
    enrich,
    draft,
    queuedRecovery,
    error: pipelineError,
  };
}
