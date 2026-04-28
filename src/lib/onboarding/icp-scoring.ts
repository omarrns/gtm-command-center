// Per-sub-dimension account-fit scoring shape.
//
// Parallel to `buildAnalysisResultSchema` in
// `src/lib/onboarding/orchestrator/run-helpers.ts`: derives a CLOSED Zod
// schema from the canonical `ICP_DIMENSIONS` config so Anthropic
// structured output can validate every per-sub-dimension score the
// scorer returns. Anthropic structured output rejects `z.record` here,
// so the schema is built field-by-field from `ICP_DIMENSIONS`.
//
// The narrow `AccountScoringBreakdown` interface is hand-written and
// kept aligned with the runtime schema via `satisfies` rather than
// `z.infer`, matching the rubric/edits/extraction convention.
//
// Normalization and disqualifier-override helpers are co-located so the
// scoring path has one place to look for "how does the model output
// turn into a 0-100 score and verdict?".

import { z } from "zod";
import {
  ICP_DIMENSIONS,
  type CoreIcpDimensionKey,
  type IcpDimensionConfig,
} from "@/lib/onboarding/icp-dimension-config";

const DISQUALIFIER_TRIGGER_THRESHOLD = 1;

export interface AccountScoringSubDimension {
  score: number;
  reasoning: string;
}

export type AccountScoringBreakdown = {
  [K in CoreIcpDimensionKey]: Record<string, AccountScoringSubDimension>;
};

export type SubDimensionWeightMap = Partial<{
  [K in CoreIcpDimensionKey]: Partial<Record<string, number>>;
}>;

const subDimensionScoringSchema = z.object({
  score: z.number().int().min(1).max(5),
  reasoning: z.string(),
}) satisfies z.ZodType<AccountScoringSubDimension>;

function buildSubDimensionShape(
  dimension: IcpDimensionConfig,
): z.ZodObject<Record<string, typeof subDimensionScoringSchema>> {
  const shape: Record<string, typeof subDimensionScoringSchema> = {};
  for (const subDimension of dimension.subDimensions) {
    shape[subDimension] = subDimensionScoringSchema;
  }
  return z.object(shape);
}

/**
 * Build the breakdown half of the account scoring schema. Closed shape:
 * every key in ICP_DIMENSIONS is required, every sub-dimension under it
 * is required, no extras allowed. Mirrors the canonical rubric shape so
 * the model can't miss a sub-field without a structured-output failure.
 */
export function buildAccountScoringBreakdownSchema() {
  const shape: Record<
    CoreIcpDimensionKey,
    ReturnType<typeof buildSubDimensionShape>
  > = {} as Record<
    CoreIcpDimensionKey,
    ReturnType<typeof buildSubDimensionShape>
  >;
  for (const dimension of ICP_DIMENSIONS) {
    shape[dimension.key] = buildSubDimensionShape(dimension);
  }
  return z.object(shape);
}

/**
 * Uniform-weight normalization across every configured sub-dimension. A
 * 5/5 across the board scores 100; a 1/1 across the board scores 0
 * (clamped to the 1-5 anchor range, so [1,5] maps linearly to [0,100]).
 *
 * Caller may pass per-sub-dimension weights for future calibration; v1
 * defaults to uniform. Weights are ignored if a referenced sub-dim does
 * not exist in the canonical config.
 */
export function computeAccountScoreFromBreakdown(
  breakdown: AccountScoringBreakdown,
  weights?: SubDimensionWeightMap,
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const dimension of ICP_DIMENSIONS) {
    const dimensionScores = breakdown[dimension.key];
    const dimensionWeights = weights?.[dimension.key];
    for (const subDimension of dimension.subDimensions) {
      const entry = dimensionScores?.[subDimension];
      if (!entry) continue;
      const weight = dimensionWeights?.[subDimension] ?? 1;
      if (weight <= 0) continue;
      const clamped = Math.min(5, Math.max(1, entry.score));
      weightedSum += (clamped - 1) * weight;
      totalWeight += 4 * weight;
    }
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100);
}

export interface DisqualifierOverride {
  triggered: boolean;
  triggers: Array<{ subDimension: string; score: number; reasoning: string }>;
}

/**
 * A clear disqualifier match must override positive fit signals: the
 * AE workflow assumes Skip/C means "do not pursue" regardless of how
 * well the firmographics line up. We treat a sub-dim score at or below
 * `DISQUALIFIER_TRIGGER_THRESHOLD` (1/5) under the `disqualifiers`
 * dimension as the trigger condition — that's the prompt's anchor for
 * "clear disqualifier match".
 */
export function detectDisqualifierOverride(
  breakdown: AccountScoringBreakdown,
): DisqualifierOverride {
  const triggers: DisqualifierOverride["triggers"] = [];
  const dimension = ICP_DIMENSIONS.find((d) => d.key === "disqualifiers");
  if (!dimension) return { triggered: false, triggers };

  const scores = breakdown.disqualifiers;
  for (const subDimension of dimension.subDimensions) {
    const entry = scores?.[subDimension];
    if (!entry) continue;
    if (entry.score <= DISQUALIFIER_TRIGGER_THRESHOLD) {
      triggers.push({
        subDimension,
        score: entry.score,
        reasoning: entry.reasoning,
      });
    }
  }

  return { triggered: triggers.length > 0, triggers };
}
