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
  // True when the model boundary failed (schema mismatch, all retries
  // exhausted) and we returned a deterministic Skip/C fallback rather
  // than throwing. Callers SHOULD persist this signal explicitly:
  // `runScoreAccounts` writes `last_error` so the cron path keeps a
  // visible trail; activation surfaces it as a "Scoring degraded"
  // badge. Distinct from `disqualifierOverride.triggered`, which is a
  // valid model output that just hit a disqualifier.
  degradedFallback: boolean;
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
    model: model ?? "claude-sonnet-4-6",
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

  // Three-layer model boundary. Each layer is the net for the one
  // above it; only this caller has all three so other call sites keep
  // their single-shot semantics.
  //   1. First attempt with the standard prompt.
  //   2. One-shot retry with an explicit reminder about emitting every
  //      sub-field (added in d54e1a0 to absorb non-canonical model
  //      output from the closed schema).
  //   3. Degraded fallback: deterministic Skip/C with every sub-dim
  //      scored 1, reason_to_believe explaining the failure. Caller
  //      never sees a thrown error from this seam — preserves per-row
  //      throughput in batch scoring and lets activation render a
  //      "Scoring degraded" placeholder instead of stranding the row.
  // Telemetry note: `degradedFallback` rate measures retry-survived
  // failures, not raw model output drift. PR 8's retro should adjust
  // the threshold accordingly.
  const log = createLogger({ runId, userId, scope: "scoring-account" });
  let analysis: IcpAccountAnalysis;
  let degradedFallback = false;
  try {
    analysis = await runGenerateObject({
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("scoring failed after retry — degraded fallback", err, {
      oppId: opp.id,
      companyName: opp.company_name,
    });
    return {
      normalizedScore: 0,
      analysisResult: buildFallbackAnalysis(opp.company_name, message),
      // No real disqualifier hit — the model never produced a breakdown.
      // Keeping triggered=false here means callers that rely on the
      // override flag for analytics see scoring failures as a separate
      // signal from genuine disqualifier hits.
      disqualifierOverride: { triggered: false, triggers: [] },
      degradedFallback: true,
    };
  }

  const override = detectDisqualifierOverride(analysis.breakdown);
  const adjusted = applyDisqualifierOverride(analysis, override);

  return {
    normalizedScore: computeAccountScore(adjusted),
    analysisResult: adjusted,
    disqualifierOverride: override,
    degradedFallback,
  };
}

/**
 * Schema-valid stand-in for failed scoring. Skip/C with all sub-dim
 * scores at 1, broad rollups at 1, and `reason_to_believe` carrying the
 * underlying error message (truncated). Critical: the caller MUST NOT
 * route this through `applyDisqualifierOverride` — that function checks
 * for sub-dim score ≤ 1 under disqualifiers and would fabricate a
 * "Disqualifier match — …" string for what is actually an infrastructure
 * failure. The override is bypassed in the catch path above.
 *
 * Exported for the fixture test, which asserts both the schema-valid
 * shape and that the override-suppression rule holds (all-1 disqualifier
 * subdims would otherwise trigger the override).
 */
export function buildFallbackAnalysis(
  companyName: string,
  errMessage: string,
): IcpAccountAnalysis {
  const stub = (reasoning: string) => ({ score: 1, reasoning });
  const failureReason = "Scoring infrastructure failure";
  return {
    company_name: companyName,
    firmo_fit: stub(failureReason),
    techno_fit: stub(failureReason),
    hiring_signal_fit: stub(failureReason),
    buyer_fit: stub(failureReason),
    proof_point_relevance: stub(failureReason),
    disqualifier_risk: stub(failureReason),
    breakdown: {
      product: {
        category: stub(failureReason),
        core_jtbd: stub(failureReason),
        wedge: stub(failureReason),
        delivery_model: stub(failureReason),
      },
      buyer: {
        economic_buyer: stub(failureReason),
        champion: stub(failureReason),
        end_user: stub(failureReason),
        deal_blocker: stub(failureReason),
      },
      firmographics: {
        industries: stub(failureReason),
        business_model: stub(failureReason),
        employee_range: stub(failureReason),
        stages: stub(failureReason),
        geographies: stub(failureReason),
      },
      technographics: {
        required_tools: stub(failureReason),
        excluded_tools: stub(failureReason),
        tech_maturity: stub(failureReason),
        data_infrastructure: stub(failureReason),
      },
      signals: {
        hiring_roles: stub(failureReason),
        jtbd_evidence: stub(failureReason),
        trigger_events: stub(failureReason),
        pain_language: stub(failureReason),
      },
      disqualifiers: {
        tech_disqualifiers: stub(failureReason),
        size_disqualifiers: stub(failureReason),
        stage_disqualifiers: stub(failureReason),
        behavioral_disqualifiers: stub(failureReason),
      },
    },
    verdict: "Skip",
    tier: "C",
    reason_to_believe: `Scoring failed — degraded fallback (${errMessage.slice(0, 140)})`,
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
