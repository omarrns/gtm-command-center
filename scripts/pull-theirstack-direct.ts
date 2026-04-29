/**
 * One-off: pull up to 7 jobs directly from TheirStack and run them
 * through the webhook lane (createOpportunity → claim → score → release).
 *
 * Usage:
 *   tsx scripts/pull-theirstack-direct.ts
 *
 * Env: reads .env.local. Requires SUPABASE_SERVICE_ROLE_KEY,
 * THEIRSTACK_API_KEY, ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL.
 *
 * After this script runs, trigger /api/cron/pipeline so research →
 * enrich → draft pick up any rows that advanced to 'scored'.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  searchJobs,
  type TheirStackFilters,
} from "@/lib/integrations/theirstack";
import {
  createOpportunity,
  claimOpportunity,
  releaseOpportunity,
} from "@/lib/pipeline/opportunities";
import { scoreOneAccount } from "@/lib/pipeline/steps/score-accounts";
import { parseIcpRubric } from "@/lib/onboarding/icp-schemas";
import type { PipelineConfigRow } from "@/lib/supabase/types";

const USER_ID = "7217874b-9288-41af-bb39-c53920a47da6";
const CAP = 7;

const FILTERS: TheirStackFilters = {
  posted_at_max_age_days: 90,
  job_title_pattern_or: [
    "Head of AI",
    "Director of Machine Learning",
    "Data Science Lead",
    "CTO",
    "VP Engineering",
    "Principal ML Engineer",
    "MLOps Lead",
  ],
  job_description_contains_or: ["Finetuning", "open-models", "fine-tune"],
  job_country_code_or: ["US", "CA"],
  limit: CAP,
  page: 2,
};

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing supabase env");
  const svc = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [scoringRes, configRes] = await Promise.all([
    svc
      .from("user_scoring_profiles")
      .select("icp_rubric")
      .eq("user_id", USER_ID)
      .maybeSingle(),
    svc
      .from("pipeline_config")
      .select("*")
      .eq("user_id", USER_ID)
      .maybeSingle(),
  ]);

  const rawRubric = scoringRes.data?.icp_rubric;
  const config = configRes.data as PipelineConfigRow | null;
  if (!rawRubric || !config) {
    throw new Error("user missing icp_rubric or pipeline_config");
  }
  const rubric = parseIcpRubric(rawRubric);

  console.log(
    `[theirstack] calling API with filters:`,
    JSON.stringify(FILTERS, null, 2),
  );
  const jobs = await searchJobs(FILTERS);
  console.log(
    `[theirstack] returned ${jobs.length} jobs (≈${jobs.length} credits spent)`,
  );

  let inserted = 0;
  let scoredCount = 0;
  let filteredCount = 0;
  let skippedDedup = 0;
  let skippedNoDomain = 0;

  for (const job of jobs) {
    if (inserted >= CAP) break;

    const companyName = job.company_object?.name ?? job.company ?? null;
    const companyDomain =
      job.company_object?.domain ?? job.company_domain ?? null;
    if (!companyName) continue;
    if (!companyDomain) {
      skippedNoDomain++;
      console.log(`[skip] no company_domain for "${companyName}"`);
      continue;
    }

    const created = await createOpportunity(svc, USER_ID, {
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
          industry: job.company_object?.industry ?? null,
          country_code: job.company_object?.country_code ?? null,
          posted_at: job.date_posted ?? null,
          source: "theirstack-direct",
        },
      ],
      buyer_personas: [
        {
          hiring_for: job.job_title,
          seniority: job.seniority ?? null,
          location: job.short_location ?? job.location ?? null,
          remote: job.remote ?? null,
          source: "theirstack-direct",
        },
      ],
    });

    if (!created) {
      skippedDedup++;
      console.log(`[dedup] ${companyName} — ${job.job_title} already in table`);
      continue;
    }

    inserted++;
    console.log(
      `[insert ${inserted}/${CAP}] ${companyName} — ${job.job_title} (opp ${created.id.slice(0, 8)})`,
    );

    const claimed = await claimOpportunity(svc, created.id, USER_ID);
    if (!claimed) {
      console.log(`[warn] could not claim ${created.id.slice(0, 8)}`);
      continue;
    }

    try {
      const { newStage, normalizedScore } = await scoreOneAccount(
        svc,
        USER_ID,
        created,
        rubric,
        config,
      );
      if (newStage === "scored") scoredCount++;
      else filteredCount++;
      console.log(
        `[scored ${inserted}] ${companyName} → ${newStage} (score: ${normalizedScore})`,
      );
    } catch (err) {
      console.error(
        `[error] scoring failed for ${created.id.slice(0, 8)}:`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      await releaseOpportunity(svc, created.id, USER_ID);
    }
  }

  console.log("\n=== summary ===");
  console.log(`theirstack returned:  ${jobs.length}`);
  console.log(`inserted:             ${inserted}`);
  console.log(`  ↳ scored:           ${scoredCount}`);
  console.log(`  ↳ filtered:         ${filteredCount}`);
  console.log(`skipped (dedup):      ${skippedDedup}`);
  console.log(`skipped (no domain):  ${skippedNoDomain}`);
  console.log(
    "\nnext: trigger /api/cron/pipeline to run research → enrich → draft on any scored rows.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
