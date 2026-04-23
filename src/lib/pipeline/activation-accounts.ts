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
 *   claim/advance stage machinery, no analyses table writes, no
 *   watchlist side effects. Results are ephemeral preview data.
 * - Tight result cap (15 candidates scored → top 5 returned) so the
 *   activation round-trip stays under ~30s on Sonnet.
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
import { createLogger } from "@/lib/logger";

const MAX_CANDIDATES = 15;
const MAX_RESULTS = 5;
const ACTIVATION_MODEL = "claude-sonnet-4-6";
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
      stats: { discovered: 0, scored: 0, errors: 0, rubricIncomplete: true },
    };
  }

  const jobs = await searchJobs(filters);
  log.info(`theirstack returned ${jobs.length} activation candidates`);

  const scored: AccountActivationResult[] = [];
  let errors = 0;

  // Inline scoring loop. Per-row error isolation mirrors
  // runScoreAccounts' contract — a single bad job doesn't blow the
  // whole activation sweep. Sonnet is fast enough that serial is fine
  // at MAX_CANDIDATES=15.
  for (const job of jobs) {
    const subject = toScoreSubject(job);
    if (!subject) continue;

    try {
      const { normalizedScore, analysisResult } = await scoreAccountAgainstIcp({
        opp: subject,
        rubric,
        userId,
        svc,
        model: ACTIVATION_MODEL,
        runId,
      });

      scored.push({
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
      });
    } catch (err) {
      errors++;
      log.error("activation scoring failed", err, { jobId: job.id });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    results: scored.slice(0, MAX_RESULTS),
    stats: {
      discovered: jobs.length,
      scored: scored.length,
      errors,
      rubricIncomplete: false,
    },
  };
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
    id: `activation-${job.id}`,
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
