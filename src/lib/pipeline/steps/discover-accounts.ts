/**
 * Pipeline Step: Discover Accounts (GTM persona).
 *
 * Mirrors runDiscover's shape for the job_seeker path but calls TheirStack
 * with a rubric-derived filter set. Writes firmographic + buyer signals
 * to the GTM columns reserved by the dual_persona_schema migration:
 * company_domain, trigger_signals, buyer_personas.
 *
 * Dedup: createOpportunity's (user_id, source, external_id) unique
 * constraint with source='theirstack' and external_id=job.id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoverResult } from "@/lib/pipeline/steps/discover";
import { createOpportunity } from "@/lib/pipeline/opportunities";
import { searchJobs, type TheirStackJob } from "@/lib/integrations/theirstack";
import {
  icpToTheirStackFilters,
  type IcpRubric,
} from "@/lib/pipeline/icp-to-theirstack-filters";
import { createLogger } from "@/lib/logger";

const MAX_DISCOVERIES_PER_RUN = 25;

export async function runDiscoverAccounts(
  svc: SupabaseClient,
  userId: string,
  rubric: IcpRubric,
  runId?: string,
): Promise<DiscoverResult> {
  const log = createLogger({
    runId,
    userId,
    scope: "discover-accounts",
  });

  const filters = icpToTheirStackFilters(rubric);

  // A call with zero job_title filters and loose firmographics will burn
  // credits returning irrelevant rows. Bail early and let the caller see
  // it as an empty run (not an error — rubric may legitimately have no
  // hiring_roles yet).
  if (!filters.job_title_or?.length) {
    log.info("skipping theirstack call — rubric has no hiring_roles");
    return { found: 0, inserted: 0 };
  }

  const jobs = await searchJobs(filters);
  log.info(`theirstack returned ${jobs.length} jobs (≈${jobs.length} credits)`);

  let inserted = 0;
  for (const job of jobs) {
    if (inserted >= MAX_DISCOVERIES_PER_RUN) break;

    const companyName = job.company_object?.name ?? job.company ?? null;
    const companyDomain =
      job.company_object?.domain ?? job.company_domain ?? null;

    if (!companyName) {
      log.warn("skipping job with no company name", { jobId: job.id });
      continue;
    }

    try {
      const created = await createOpportunity(svc, userId, {
        source: "theirstack",
        external_id: job.id,
        company_name: companyName,
        company_domain: companyDomain,
        role_title: job.job_title,
        job_url: job.url ?? undefined,
        job_description: job.description ?? undefined,
        job_posted_at: job.date_posted ?? undefined,
        trigger_signals: [buildTriggerSignal(job)],
        buyer_personas: [buildBuyerPersona(job)],
      });

      if (created) inserted++;
    } catch (err) {
      log.error("failed to insert account", err, { jobId: job.id });
    }
  }

  return { found: jobs.length, inserted };
}

function buildTriggerSignal(job: TheirStackJob): Record<string, unknown> {
  return {
    funding_stage: job.company_object?.funding_stage ?? null,
    employee_count: job.company_object?.employee_count ?? null,
    industry_id: job.company_object?.industry_id ?? null,
    industry: job.company_object?.industry ?? null,
    annual_revenue_usd: job.company_object?.annual_revenue_usd ?? null,
    country_code: job.company_object?.country_code ?? null,
    posted_at: job.date_posted ?? null,
    source: "theirstack",
  };
}

function buildBuyerPersona(job: TheirStackJob): Record<string, unknown> {
  return {
    hiring_for: job.job_title,
    seniority: job.seniority ?? null,
    location: job.short_location ?? job.location ?? null,
    remote: job.remote ?? null,
    source: "theirstack",
  };
}
