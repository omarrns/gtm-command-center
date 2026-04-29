/**
 * ICP account scorer — Exa enrichment + generateObject (single Sonnet
 * call) returning broad components + per-sub-dimension breakdown.
 *
 * v1 keeps a single LLM call: the prompt asks for the existing six
 * broad fields (firmo_fit, techno_fit, ...) for backward-compatible
 * persistence + UI, plus a closed nested breakdown keyed by
 * canonical `ICP_DIMENSIONS`. Two passes were considered and deferred
 * (see plan §5 "scoring strategy") — split only if structured-output
 * cost or reliability becomes an issue.
 *
 * Disqualifier matches MUST force verdict='Skip' / tier='C' regardless
 * of model output. We trust the model to score sub-dimensions but not
 * to honor the override consistently, so the post-processing
 * `applyDisqualifierOverride` is the safety net.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { exaFindCompany, formatExaResults } from "@/lib/ai/exa";
import { loadMemoryContext } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import { runGenerateObject, type AiCallScope } from "@/lib/ai/calls";
import { MODELS } from "@/lib/ai/anthropic";
import { createLogger } from "@/lib/logger";
import {
  buildIcpAccountFitSystem,
  buildIcpAccountFitPrompt,
  type AccountFirmographics,
} from "@/lib/skills/prompts/icp-account-fit";
import {
  buildAccountScoringBreakdownSchema,
  computeAccountScoreFromBreakdown,
  detectDisqualifierOverride,
  type AccountScoringBreakdown,
  type DisqualifierOverride,
  type SubDimensionWeightMap,
} from "@/lib/onboarding/icp-dimensions";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import { coerceIcpRubric } from "@/lib/onboarding/icp-schemas";

// Loosened from int().min(1).max(5) for the same reason as
// subDimensionScoringSchema in icp-scoring.ts — Sonnet's structured
// output occasionally emits decimals or out-of-range integers and a
// hard schema reject on a recoverable value fails the whole 31-field
// object. The 1-5 anchor is enforced via the prompt; consumers that
// care (computeAccountScoreFromBreakdown) round + clamp at read time.
const broadComponentSchema = z.object({
  score: z.number(),
  reasoning: z.string(),
});

const breakdownSchema = buildAccountScoringBreakdownSchema();

export interface IcpAccountBroadComponent {
  score: number;
  reasoning: string;
}

export interface IcpAccountAnalysis {
  company_name: string;
  firmo_fit: IcpAccountBroadComponent;
  techno_fit: IcpAccountBroadComponent;
  hiring_signal_fit: IcpAccountBroadComponent;
  buyer_fit: IcpAccountBroadComponent;
  proof_point_relevance: IcpAccountBroadComponent;
  disqualifier_risk: IcpAccountBroadComponent;
  breakdown: AccountScoringBreakdown;
  verdict: "Pursue" | "Worth exploring" | "Skip";
  tier: "A" | "B" | "C";
  reason_to_believe: string;
}

export const icpAccountAnalysisSchema = z.object({
  company_name: z.string(),
  firmo_fit: broadComponentSchema,
  techno_fit: broadComponentSchema,
  hiring_signal_fit: broadComponentSchema,
  buyer_fit: broadComponentSchema,
  proof_point_relevance: broadComponentSchema,
  disqualifier_risk: broadComponentSchema,
  breakdown: breakdownSchema,
  verdict: z.enum(["Pursue", "Worth exploring", "Skip"]),
  tier: z.enum(["A", "B", "C"]),
  reason_to_believe: z.string(),
}) satisfies z.ZodType<IcpAccountAnalysis>;

export interface AccountScoringResult {
  normalizedScore: number;
  analysisResult: IcpAccountAnalysis;
  disqualifierOverride: DisqualifierOverride;
}

const BROAD_COMPONENT_KEYS = [
  "firmo_fit",
  "techno_fit",
  "hiring_signal_fit",
  "buyer_fit",
  "proof_point_relevance",
  "disqualifier_risk",
] as const satisfies readonly (keyof IcpAccountAnalysis)[];

/**
 * Normalise the breakdown into a 0-100 score. Uniform sub-dim weights
 * for v1 — same scaling target as the previous broad-six average so
 * downstream thresholds (watchlist >= 80, score_threshold) stay
 * comparable in magnitude.
 */
export function computeAccountScore(
  analysis: IcpAccountAnalysis,
  weights?: SubDimensionWeightMap,
): number {
  return computeAccountScoreFromBreakdown(analysis.breakdown, weights);
}

// Narrower than OpportunityRow — the scorer only needs id + company
// identity + the JSONB trigger/persona fields. OpportunityRow satisfies
// this structurally, so the pipeline's score-accounts step still passes
// its rows in unchanged. /activate's inline scoring builds the subject
// straight from a TheirStackJob without having to forge a full
// opportunity row.
export interface ScoreAccountSubject {
  id: string;
  company_name: string;
  company_domain: string | null;
  trigger_signals: Record<string, unknown>[] | null;
  buyer_personas: Record<string, unknown>[] | null;
}

export interface ScoreAccountInput {
  opp: ScoreAccountSubject;
  rubric: IcpRubric;
  userId: string;
  svc: SupabaseClient;
  model?: string;
  runId?: string;
}

export async function scoreAccountAgainstIcp({
  opp,
  rubric,
  userId,
  svc,
  model,
  runId,
}: ScoreAccountInput): Promise<AccountScoringResult> {
  // Exa research + memory context fan out in parallel; both are bounded
  // by Exa and DB latency, not by each other.
  const [rawResearch, memoryCtx] = await Promise.all([
    exaFindCompany(opp.company_name),
    loadMemoryContext(userId, svc),
  ]);

  const research = [
    formatExaResults(rawResearch.overview, "Company Overview"),
    formatExaResults(rawResearch.funding, "Funding & Stage"),
    formatExaResults(rawResearch.news, "Recent News"),
  ].join("\n\n");

  const sender = extractSenderIdentity(memoryCtx, memoryCtx.displayName);
  const firmographics = extractFirmographics(opp);
  const normalizedRubric = coerceIcpRubric(rubric);

  const scope: AiCallScope = {
    userId,
    runId,
    scopeTable: "opportunities",
    scopeId: opp.id,
    callPurpose: "score-account",
  };

  const basePrompt = buildIcpAccountFitPrompt({
    companyName: opp.company_name,
    rubric: normalizedRubric,
    firmographics,
    research,
  });
  const baseArgs = {
    model: model ?? MODELS.sonnet,
    system: buildIcpAccountFitSystem(sender),
    schema: icpAccountAnalysisSchema,
    // 25 sub-dim breakdown × {score, reasoning} + 6 broad rollups +
    // verdict/tier/reason ≈ 3K tokens at typical reasoning length. 8192
    // gives headroom against truncation. Matches `scoring.ts:158`
    // (job_seeker analysisSchema) — same pattern, same budget.
    maxOutputTokens: 8192,
    // Stay on the default `jsonTool` path — Anthropic's strict
    // `outputFormat` grammar compiler rejects icpAccountAnalysisSchema
    // with "compiled grammar is too large" because the closed shape has
    // 31 required nested {score, reasoning} pairs. `jsonTool` is more
    // permissive and successfully accepts the same schema.
    scope,
  };

  // Two-attempt model boundary. The retry is local to this scorer so
  // other generateObject call sites keep their single-shot semantics.
  //   1. First attempt with the standard prompt.
  //   2. One-shot retry with an explicit reminder about emitting every
  //      sub-field (added in d54e1a0 to absorb non-canonical model
  //      output from the closed schema).
  // If both attempts fail, throw. Batch callers isolate per-row errors;
  // activation renders the dedicated scoring-failed state instead of
  // synthesizing fake Skip/C scores.
  const log = createLogger({ runId, userId, scope: "scoring-account" });
  const analysis = await runGenerateObject({
    ...baseArgs,
    prompt: basePrompt,
  }).catch(async (err: unknown) => {
    log.warn("first scoring attempt failed; retrying with strict reminder", {
      oppId: opp.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return runGenerateObject({
      ...baseArgs,
      prompt: `${basePrompt}\n\nReminder: every sub-field listed in the breakdown must appear with both \`score\` (integer 1-5) and \`reasoning\` (string). When you have no signal for a sub-field, emit score 3 with reasoning "(no evidence)" — do not omit the key.`,
    });
  });

  const override = detectDisqualifierOverride(analysis.breakdown);
  const adjusted = applyDisqualifierOverride(analysis, override);

  return {
    normalizedScore: computeAccountScore(adjusted),
    analysisResult: adjusted,
    disqualifierOverride: override,
  };
}

/**
 * Force verdict='Skip' / tier='C' on a clear disqualifier hit, and
 * clamp the broad `disqualifier_risk` rollup down to 1 so the broad
 * scorecard agrees with the breakdown. Reason-to-believe is rewritten
 * to surface the trigger so the AE knows why the row was killed.
 */
function applyDisqualifierOverride(
  analysis: IcpAccountAnalysis,
  override: DisqualifierOverride,
): IcpAccountAnalysis {
  if (!override.triggered) return analysis;
  const triggerSummary = override.triggers
    .map((t) => `${t.subDimension}: ${t.reasoning}`)
    .join(" | ");
  return {
    ...analysis,
    verdict: "Skip",
    tier: "C",
    disqualifier_risk: {
      score: Math.min(analysis.disqualifier_risk.score, 1),
      reasoning:
        analysis.disqualifier_risk.reasoning ||
        "Disqualifier override engaged.",
    },
    reason_to_believe: `Disqualifier match — ${triggerSummary}`.slice(0, 400),
  };
}

function extractFirmographics(opp: ScoreAccountSubject): AccountFirmographics {
  const triggers = (opp.trigger_signals ?? [])[0] ?? {};
  const personas = (opp.buyer_personas ?? [])[0] ?? {};

  const t = triggers as Record<string, unknown>;
  const p = personas as Record<string, unknown>;

  return {
    company_domain: opp.company_domain,
    funding_stage: typeof t.funding_stage === "string" ? t.funding_stage : null,
    employee_count:
      typeof t.employee_count === "number" ? t.employee_count : null,
    industry: typeof t.industry === "string" ? t.industry : null,
    industry_id: typeof t.industry_id === "number" ? t.industry_id : null,
    annual_revenue_usd:
      typeof t.annual_revenue_usd === "number" ? t.annual_revenue_usd : null,
    country_code: typeof t.country_code === "string" ? t.country_code : null,
    hiring_for: typeof p.hiring_for === "string" ? p.hiring_for : null,
    seniority: typeof p.seniority === "string" ? p.seniority : null,
  };
}

/**
 * Re-export for callers (analytics, persistence) that want a stable
 * list of the broad rollup fields without importing the constants
 * tuple inline.
 */
export const ICP_ACCOUNT_BROAD_COMPONENT_KEYS = BROAD_COMPONENT_KEYS;
