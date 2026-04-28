/**
 * ICP account scorer — parallel Exa enrichment + generateObject.
 *
 * Per-account analog of `scoreOpportunity` in scoring.ts, but scoped to
 * the GTM persona. The rubric drives the scoring anchors; Exa provides
 * research evidence (funding news, competitive context) the scorer needs
 * to judge proof-point relevance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { exaFindCompany, formatExaResults } from "@/lib/ai/exa";
import { loadMemoryContext } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import { runGenerateObject, type AiCallScope } from "@/lib/ai/calls";
import {
  buildIcpAccountFitSystem,
  buildIcpAccountFitPrompt,
  type AccountFirmographics,
} from "@/lib/skills/prompts/icp-account-fit";
import type { IcpRubric } from "@/lib/pipeline/icp-to-theirstack-filters";
import { coerceIcpRubric } from "@/lib/onboarding/icp-schemas";

const accountDimensionSchema = z.object({
  score: z.number().min(1).max(5),
  reasoning: z.string(),
});

export const icpAccountAnalysisSchema = z.object({
  company_name: z.string(),
  firmo_fit: accountDimensionSchema,
  techno_fit: accountDimensionSchema,
  hiring_signal_fit: accountDimensionSchema,
  buyer_fit: accountDimensionSchema,
  proof_point_relevance: accountDimensionSchema,
  disqualifier_risk: accountDimensionSchema,
  verdict: z.enum(["Pursue", "Worth exploring", "Skip"]),
  tier: z.enum(["A", "B", "C"]),
  reason_to_believe: z.string(),
});

export type IcpAccountAnalysis = z.infer<typeof icpAccountAnalysisSchema>;

export interface AccountScoringResult {
  normalizedScore: number;
  analysisResult: IcpAccountAnalysis;
}

const DIMENSIONS = [
  "firmo_fit",
  "techno_fit",
  "hiring_signal_fit",
  "buyer_fit",
  "proof_point_relevance",
  "disqualifier_risk",
] as const;

/**
 * Normalise the six 1-5 dimension scores into a 0-100 score. Same scaling
 * as scoreOpportunity's `normalizedScore` so downstream thresholds
 * (watchlist >= 80, activation preview tiering) apply unchanged.
 */
export function computeAccountScore(analysis: IcpAccountAnalysis): number {
  const MAX_PER_DIM = 5;
  let sum = 0;
  for (const dim of DIMENSIONS) {
    sum += analysis[dim].score;
  }
  const max = DIMENSIONS.length * MAX_PER_DIM;
  return Math.round((sum / max) * 100);
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

  const analysis = await runGenerateObject({
    model: model ?? "claude-sonnet-4-6",
    system: buildIcpAccountFitSystem(sender),
    prompt: buildIcpAccountFitPrompt({
      companyName: opp.company_name,
      rubric: normalizedRubric,
      firmographics,
      research,
    }),
    schema: icpAccountAnalysisSchema,
    maxOutputTokens: 4096,
    scope,
  });

  return {
    normalizedScore: computeAccountScore(analysis),
    analysisResult: analysis,
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
