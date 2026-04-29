/**
 * Activation Search Engine — GTM persona.
 *
 * Runs a synchronous TheirStack → score pass immediately after ICP
 * confirm. Returns the top 5 scored accounts so the user sees
 * value before the weekly dormant cron or the next 6-hourly
 * pipeline cron runs.
 *
 * Key differences from runDiscoverAccounts + runScoreAccounts:
 * - Caller runs the whole flow inline in a single /api request; no
 *   claim/advance stage machinery, no watchlist side effects.
 * - Tight result cap (15 candidates scored → top 5 returned) so the
 *   activation round-trip stays under ~30s on Sonnet.
 * - Scored results are persisted to opportunities (stage='scored') so
 *   /accounts is populated immediately without waiting for a cron run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { searchJobs, type TheirStackJob } from "@/lib/integrations/theirstack";
import {
  icpToTheirStackFilters,
  type IcpRubric,
} from "@/lib/pipeline/icp-to-theirstack-filters";
import {
  scoreAccountAgainstIcp,
  type IcpAccountAnalysis,
  type ScoreAccountSubject,
} from "@/lib/pipeline/scoring-account";
import { buildScoreComponents } from "@/lib/pipeline/steps/score-accounts";
import { createOpportunity, advanceStage } from "@/lib/pipeline/opportunities";
import { createLogger } from "@/lib/logger";
import { MODELS } from "@/lib/ai/anthropic";

const MAX_CANDIDATES = 15;
const MAX_RESULTS = 5;
const ACTIVATION_MODEL = MODELS.sonnet;
const POSTED_MAX_AGE_DAYS = 30;

export interface AccountActivationResult {
  id: string;
  companyName: string;
  companyDomain: string | null;
  roleTitle: string;
  score: number;
  tier: "A" | "B" | "C";
  verdict: "Pursue" | "Worth exploring" | "Skip";
  reasonToBelieve: string;
  fundingStage: string | null;
  employeeCount: number | null;
  industry: string | null;
  analysis: IcpAccountAnalysis;
}

export interface AccountActivationStats {
  discovered: number;
  scored: number;
  errors: number;
  // First per-row error message (truncated, mapped through mapAiError) so
  // the UI can show the user a friendly cause instead of a stuck spinner.
  firstError: string | null;
  rubricIncomplete: boolean;
}

export interface AccountActivationSearchResult {
  results: AccountActivationResult[];
  stats: AccountActivationStats;
}

export async function runAccountActivationSearch(
  svc: SupabaseClient,
  userId: string,
  rubric: IcpRubric,
  runId?: string,
): Promise<AccountActivationSearchResult> {
  const log = createLogger({ runId, userId, scope: "activation-accounts" });

  const filters = icpToTheirStackFilters(rubric, {
    limit: MAX_CANDIDATES,
    postedMaxAgeDays: POSTED_MAX_AGE_DAYS,
  });

  if (!filters.job_title_or?.length) {
    log.info("activation skipped — rubric has no hiring_roles");
    return {
      results: [],
      stats: {
        discovered: 0,
        scored: 0,
        errors: 0,
        firstError: null,
        rubricIncomplete: true,
      },
    };
  }

  const jobs = await searchJobs(filters);
  log.info(`theirstack returned ${jobs.length} activation candidates`);

  const scored: AccountActivationResult[] = [];
  let errors = 0;
  let firstError: string | null = null;

  // Inline scoring loop. Per-row error isolation mirrors
  // runScoreAccounts' contract — a single bad job doesn't blow the
  // whole activation sweep. Sonnet is fast enough that serial is fine
  // at MAX_CANDIDATES=15.
  for (const job of jobs) {
    const subject = toScoreSubject(job);
    if (!subject) continue;

    try {
      const scoring = await scoreAccountAgainstIcp({
        opp: subject,
        rubric,
        userId,
        svc,
        model: ACTIVATION_MODEL,
        runId,
      });
      const { normalizedScore, analysisResult } = scoring;

      const activationResult: AccountActivationResult = {
        id: subject.id,
        companyName: subject.company_name,
        companyDomain: subject.company_domain,
        roleTitle: job.job_title,
        score: normalizedScore,
        tier: analysisResult.tier,
        verdict: analysisResult.verdict,
        reasonToBelieve: analysisResult.reason_to_believe,
        fundingStage: job.company_object?.funding_stage ?? null,
        employeeCount: job.company_object?.employee_count ?? null,
        industry: job.company_object?.industry ?? null,
        analysis: analysisResult,
      };
      scored.push(activationResult);

      // Persist to opportunities so /accounts is populated immediately.
      // Non-critical: preview still works if this fails.
      try {
        await persistActivationResult(
          svc,
          userId,
          job,
          activationResult,
          runId,
        );
      } catch (persistErr) {
        log.error("activation persist failed (non-critical)", persistErr, {
          jobId: job.id,
        });
      }
    } catch (err) {
      errors++;
      log.error("activation scoring failed", err, { jobId: job.id });
      if (firstError === null) {
        firstError = mapAiError(
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    results: scored.slice(0, MAX_RESULTS),
    stats: {
      discovered: jobs.length,
      scored: scored.length,
      errors,
      firstError,
      rubricIncomplete: false,
    },
  };
}

// Strip SDK-internal prefixes from raw error messages before exposing to
// the user. Return one meaningful sentence under 240 chars. No stack
// traces, no nested prefixes.
export function mapAiError(raw: string): string {
  const trimmed = raw.replace(/^AI_[A-Za-z]+Error:\s*/, "").trim();
  if (
    trimmed.startsWith("No object generated") ||
    trimmed.startsWith("Scoring failed") ||
    trimmed.startsWith("Failed after")
  ) {
    return "Scoring response didn't match the expected shape — retry, or narrow the rubric.";
  }
  return trimmed.slice(0, 240);
}

function toScoreSubject(job: TheirStackJob): ScoreAccountSubject | null {
  const companyName = job.company_object?.name ?? job.company ?? null;
  if (!companyName) return null;
  const companyDomain =
    job.company_object?.domain ?? job.company_domain ?? null;
  // Match discover-accounts: rows without a resolvable domain can't be
  // enriched or dedup'd downstream. Activation stays preview-only, but
  // the UX is better off not showing an account the user can't do
  // anything with.
  if (!companyDomain) return null;

  return {
    id: job.id,
    company_name: companyName,
    company_domain: companyDomain,
    trigger_signals: [
      {
        funding_stage: job.company_object?.funding_stage ?? null,
        employee_count: job.company_object?.employee_count ?? null,
        industry: job.company_object?.industry ?? null,
        industry_id: job.company_object?.industry_id ?? null,
        annual_revenue_usd: job.company_object?.annual_revenue_usd ?? null,
        country_code: job.company_object?.country_code ?? null,
        posted_at: job.date_posted ?? null,
        source: "theirstack",
      },
    ],
    buyer_personas: [
      {
        hiring_for: job.job_title,
        seniority: job.seniority ?? null,
        location: job.short_location ?? job.location ?? null,
        remote: job.remote ?? null,
        source: "theirstack",
      },
    ],
  };
}

async function persistActivationResult(
  svc: SupabaseClient,
  userId: string,
  job: TheirStackJob,
  result: AccountActivationResult,
  runId?: string,
): Promise<void> {
  const log = createLogger({ runId, userId, scope: "activation-accounts" });

  const companyName = job.company_object?.name ?? job.company ?? null;
  const companyDomain =
    job.company_object?.domain ?? job.company_domain ?? null;
  if (!companyName || !companyDomain) return;

  const newOpp = await createOpportunity(svc, userId, {
    source: "theirstack",
    external_id: job.id,
    company_name: companyName,
    company_domain: companyDomain,
    role_title: job.job_title,
    job_url: job.url ?? undefined,
    job_description: job.description ?? undefined,
    job_posted_at: job.date_posted ?? undefined,
    trigger_signals: [
      {
        funding_stage: job.company_object?.funding_stage ?? null,
        employee_count: job.company_object?.employee_count ?? null,
        industry_id: job.company_object?.industry_id ?? null,
        industry: job.company_object?.industry ?? null,
        annual_revenue_usd: job.company_object?.annual_revenue_usd ?? null,
        country_code: job.company_object?.country_code ?? null,
        posted_at: job.date_posted ?? null,
        source: "theirstack",
      },
    ],
    buyer_personas: [
      {
        hiring_for: job.job_title,
        seniority: job.seniority ?? null,
        location: job.short_location ?? job.location ?? null,
        remote: job.remote ?? null,
        source: "theirstack",
      },
    ],
  });

  // Duplicate — the real pipeline already owns this row; don't overwrite.
  if (!newOpp) return;

  const { data: analysis, error: analysisErr } = await svc
    .from("analyses")
    .insert({
      user_id: userId,
      skill_slug: "icp-account-fit",
      company_name: companyName,
      role_title: null,
      job_description: job.description ?? null,
      status: "complete",
      input: {
        company_name: companyName,
        company_domain: companyDomain,
        source: "activation",
      },
      result: result.analysis,
    })
    .select("id")
    .single();

  if (analysisErr) {
    log.error("analyses write failed", analysisErr, { jobId: job.id });
    return;
  }

  await advanceStage(svc, newOpp.id, userId, "discovered", "scored", {
    score: result.score,
    score_components: buildScoreComponents(result.analysis),
    analysis_id: analysis.id,
  });
}
