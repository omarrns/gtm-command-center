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

const MAX_DISCOVERIES_PER_RUN = 10;

export interface DiscoverResult {
  found: number;
  inserted: number;
}

export async function runDiscover(
  svc: SupabaseClient,
  userId: string,
  config: PipelineConfigRow,
): Promise<DiscoverResult> {
  const jobs = await searchJobs(config.search_queries, config.search_locations);

  let inserted = 0;
  for (const job of jobs) {
    if (inserted >= MAX_DISCOVERIES_PER_RUN) break;

    const created = await createOpportunity(svc, userId, {
      source: "jsearch",
      external_id: job.job_id,
      company_name: job.employer_name,
      role_title: job.job_title,
      job_url: job.job_apply_link,
      job_description: job.job_description ?? undefined,
    });

    if (created) inserted++;
  }

  return { found: jobs.length, inserted };
}
