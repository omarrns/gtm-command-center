/**
 * Existing-data activation scorer.
 *
 * Reuses saved GTM opportunity metadata instead of calling TheirStack.
 * This is for debugging/re-assessing the activation scoring boundary
 * without spending discovery credits or pulling fresh jobs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRow } from "@/lib/supabase/types";
import type { IcpRubric } from "@/lib/pipeline/icp-to-theirstack-filters";
import {
  computeAccountScore,
  scoreAccountAgainstIcp,
  type IcpAccountAnalysis,
} from "@/lib/pipeline/scoring-account";
import {
  mapAiError,
  type AccountActivationResult,
  type AccountActivationSearchResult,
} from "@/lib/pipeline/activation-accounts";
import { createLogger } from "@/lib/logger";

const MAX_CANDIDATES = 15;
const DEFAULT_CANDIDATES = 5;
const MAX_RESULTS = 5;
const ACTIVATION_MODEL = "claude-sonnet-4-6";

export async function runExistingAccountActivationSearch(
  svc: SupabaseClient,
  userId: string,
  rubric: IcpRubric,
  runId?: string,
  candidateLimit = DEFAULT_CANDIDATES,
): Promise<AccountActivationSearchResult> {
  const limit = Math.min(Math.max(candidateLimit, 1), MAX_CANDIDATES);
  const log = createLogger({
    runId,
    userId,
    scope: "activation-existing-accounts",
  });

  log.info("loading saved GTM opportunities for activation scoring", {
    source: "existing",
    limit,
  });

  const { data, error } = await svc
    .from("opportunities")
    .select("*")
    .eq("user_id", userId)
    .in("source", ["theirstack", "exa-dormant"])
    .not("company_domain", "is", null)
    .order("discovered_at", { ascending: false })
    .limit(limit);

  if (error) {
    log.error("failed to load saved GTM opportunities", error);
    throw error;
  }

  const opportunities = (data ?? []) as OpportunityRow[];
  log.info("loaded saved GTM opportunities", {
    count: opportunities.length,
    ids: opportunities.map((opp) => opp.id),
  });

  const scored: AccountActivationResult[] = [];
  let errors = 0;
  let firstError: string | null = null;

  for (const opp of opportunities) {
    log.info("scoring saved GTM opportunity", {
      oppId: opp.id,
      companyName: opp.company_name,
      companyDomain: opp.company_domain,
      source: opp.source,
      roleTitle: opp.role_title,
    });

    try {
      const scoring = await scoreAccountAgainstIcp({
        opp,
        rubric,
        userId,
        svc,
        model: ACTIVATION_MODEL,
        runId,
      });
      scored.push(toActivationResultFromOpportunity(opp, scoring.analysisResult));
      log.info("saved GTM opportunity scored", {
        oppId: opp.id,
        score: scoring.normalizedScore,
        tier: scoring.analysisResult.tier,
        verdict: scoring.analysisResult.verdict,
      });
    } catch (err) {
      errors++;
      log.error("saved GTM opportunity scoring failed", err, {
        oppId: opp.id,
        companyName: opp.company_name,
      });
      if (firstError === null) {
        firstError = mapAiError(
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);

  log.info("existing activation scoring complete", {
    discovered: opportunities.length,
    scored: scored.length,
    errors,
    returned: Math.min(scored.length, MAX_RESULTS),
    firstError,
  });

  return {
    results: scored.slice(0, MAX_RESULTS),
    stats: {
      discovered: opportunities.length,
      scored: scored.length,
      errors,
      firstError,
      rubricIncomplete: false,
    },
  };
}

function toActivationResultFromOpportunity(
  opp: OpportunityRow,
  analysis: IcpAccountAnalysis,
): AccountActivationResult {
  const trigger = (opp.trigger_signals ?? [])[0] ?? {};
  const t = trigger as Record<string, unknown>;
  return {
    id: opp.id,
    companyName: opp.company_name,
    companyDomain: opp.company_domain,
    roleTitle: opp.role_title ?? "Existing account",
    score: computeAccountScore(analysis),
    tier: analysis.tier,
    verdict: analysis.verdict,
    reasonToBelieve: analysis.reason_to_believe,
    fundingStage: typeof t.funding_stage === "string" ? t.funding_stage : null,
    employeeCount: typeof t.employee_count === "number" ? t.employee_count : null,
    industry: typeof t.industry === "string" ? t.industry : null,
    analysis,
  };
}
