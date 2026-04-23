/**
 * Pipeline Step: Discover
 *
 * Calls JSearch API to find new roles, inserts them as 'discovered' opportunities.
 * Dedup handled by unique constraint (user_id, source, external_id) + 30-day app check.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineConfigRow } from "@/lib/supabase/types";
import { searchJobs } from "@/lib/pipeline/jsearch";
import { createOpportunity } from "@/lib/pipeline/opportunities";
import { createLogger } from "@/lib/logger";

const MAX_DISCOVERIES_PER_RUN = 7;

export interface DiscoverResult {
  found: number;
  inserted: number;
}

export async function runDiscover(
  svc: SupabaseClient,
  userId: string,
  config: PipelineConfigRow,
  runId?: string,
): Promise<DiscoverResult> {
  const log = createLogger({ runId, userId, scope: "discover" });
  const jobs = await searchJobs(
    config.search_queries,
    config.search_locations,
    {
      datePosted: "today",
    },
  );

  let inserted = 0;
  for (const job of jobs) {
    if (inserted >= MAX_DISCOVERIES_PER_RUN) break;

    try {
      const created = await createOpportunity(svc, userId, {
        source: "jsearch",
        external_id: job.job_id,
        company_name: job.employer_name,
        role_title: job.job_title,
        job_url: job.job_apply_link,
        job_description: job.job_description ?? undefined,
        job_posted_at: job.job_posted_at_datetime_utc ?? undefined,
        job_city: job.job_city,
        job_state: job.job_state,
        job_is_remote: job.job_is_remote,
        job_employment_type: job.job_employment_type,
        job_min_salary: job.job_min_salary,
        job_max_salary: job.job_max_salary,
        job_salary_currency: job.job_salary_currency,
        job_salary_period: job.job_salary_period,
        job_required_skills: job.job_required_skills,
      });

      if (created) inserted++;
    } catch (err) {
      // Per-job isolation: log and continue so one bad insert doesn't skip the rest
      log.error("failed to insert job", err, { jobId: job.job_id });
    }
  }

  return { found: jobs.length, inserted };
}
