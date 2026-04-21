/**
 * Phase 11: Activation Search Engine
 *
 * Runs a fast discover → score pass immediately after onboarding confirm.
 * Returns the top 5 scored opportunities so the user sees value before
 * the daily cron pipeline runs.
 *
 * Key differences from the full pipeline:
 * - JSearch with numPages=1, datePosted="month" + 10-day post-filter
 * - Scores all inserted opportunities (no batch cap)
 * - No research, enrich, draft, or queue stages
 * - Rank step queries all recent scored opportunities (retry-safe)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineConfigRow, OpportunityRow } from "@/lib/supabase/types";
import { searchJobs } from "@/lib/pipeline/jsearch";
import { createOpportunity } from "@/lib/pipeline/opportunities";
import { scoreOneOpportunity } from "@/lib/pipeline/steps/score";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivationResult {
  id: string;
  companyName: string;
  roleTitle: string;
  score: number;
  jobUrl: string | null;
  postedAt: string | null;
  fitRationale: string;
  isCloseMatch: boolean;
  opportunity: OpportunityRow;
}

export interface ActivationStats {
  discovered: number;
  inserted: number;
  scored: number;
  filtered: number;
  errors: number;
}

export interface ActivationSearchResult {
  results: ActivationResult[];
  stats: ActivationStats;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ACTIVATION_DISCOVERIES = 10;
const RECENCY_DAYS = 10;
const MAX_RESULTS = 5;
const ACTIVATION_MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runActivationSearch(
  svc: SupabaseClient,
  userId: string,
  config: PipelineConfigRow,
): Promise<ActivationSearchResult> {
  const startTime = Date.now();

  const stats: ActivationStats = {
    discovered: 0,
    inserted: 0,
    scored: 0,
    filtered: 0,
    errors: 0,
  };

  // 1. Discover — use month window from JSearch, post-filter to 10 days
  let rawJobs = await searchJobs(
    config.search_queries,
    config.search_locations,
    { numPages: 1, datePosted: "month" },
  );

  // 2. Post-filter: keep only jobs with a known posted date within 10 days.
  //    Exclude undated jobs — activation promises "last 10 days only."
  const cutoff = new Date(
    Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  rawJobs = rawJobs.filter(
    (job) =>
      job.job_posted_at_datetime_utc &&
      job.job_posted_at_datetime_utc >= cutoff,
  );

  rawJobs = rawJobs.slice(0, MAX_ACTIVATION_DISCOVERIES);
  stats.discovered = rawJobs.length;

  // 3. Insert as opportunities + score each one.
  //    On dedup hit, check if the existing row is still at 'discovered'
  //    (unscored from a prior interrupted run) and score it.
  for (let i = 0; i < rawJobs.length; i++) {
    const job = rawJobs[i];

    try {
      const opp = await createOpportunity(svc, userId, {
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

      if (opp) {
        stats.inserted++;
        await scoreAndAdvance(svc, userId, opp, config, stats);
      } else {
        const { data: existing } = await svc
          .from("opportunities")
          .select("*")
          .eq("user_id", userId)
          .eq("source", "jsearch")
          .eq("external_id", job.job_id)
          .eq("stage", "discovered")
          .maybeSingle();

        if (existing) {
          await scoreAndAdvance(
            svc,
            userId,
            existing as OpportunityRow,
            config,
            stats,
          );
        }
      }
    } catch (err) {
      console.error(
        `[activation] Job ${i + 1}/${rawJobs.length} failed (${job.employer_name}):`,
        err instanceof Error ? err.message : err,
      );
      stats.errors++;
    }
  }

  // 4. Rank — query all recent scored/filtered opportunities (retry-safe)
  const results = await rankResults(svc, userId, config.score_threshold);

  // 5. Flag activation as complete (success path)
  const completion = await markActivationComplete(svc, userId);
  if (!completion.ok) {
    console.error(
      "[activation] Failed to set activation_completed_at:",
      completion.error,
    );
  }

  console.log(
    `[activation] Complete in ${Date.now() - startTime}ms — ${stats.discovered} discovered, ${stats.scored} scored, ${stats.filtered} filtered, ${stats.errors} errors, ${results.length} results`,
  );

  return { results, stats };
}

// ---------------------------------------------------------------------------
// Score a single opportunity — delegates to the shared primitive in
// steps/score.ts so stage-transition guarantees are identical to the
// scheduled pipeline. Handles error recording per-opportunity so the
// batch loop can continue.
// ---------------------------------------------------------------------------

async function scoreAndAdvance(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
  config: PipelineConfigRow,
  stats: ActivationStats,
): Promise<void> {
  try {
    const { newStage } = await scoreOneOpportunity(svc, userId, opp, config, {
      source: "activation",
      model: ACTIVATION_MODEL,
    });

    if (newStage === "scored") {
      stats.scored++;
    } else {
      stats.filtered++;
    }
  } catch (err) {
    stats.errors++;
    await svc
      .from("opportunities")
      .update({
        last_error: err instanceof Error ? err.message : String(err),
      })
      .eq("id", opp.id)
      .eq("user_id", userId);
    console.error(
      `[activation:score] FAILED for ${opp.company_name} — ${opp.role_title}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// ---------------------------------------------------------------------------
// Rank: query recent opportunities + backfill below threshold
// ---------------------------------------------------------------------------

async function rankResults(
  svc: SupabaseClient,
  userId: string,
  scoreThreshold: number,
): Promise<ActivationResult[]> {
  const tenDaysAgo = new Date(
    Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Use discovered_at as the window (always set), but return job_posted_at
  // for accurate "Posted X ago" display.
  const { data: opportunities, error: rankError } = await svc
    .from("opportunities")
    .select("*")
    .eq("user_id", userId)
    .in("stage", ["scored", "filtered"])
    .gte("discovered_at", tenDaysAgo)
    .not("score", "is", null)
    .order("score", { ascending: false })
    .limit(MAX_RESULTS * 2); // fetch extra for backfill pool

  if (rankError) {
    throw new Error(`[activation:rank] Query failed: ${rankError.message}`);
  }

  if (!opportunities || opportunities.length === 0) return [];

  const above = opportunities.filter(
    (o) => (o.score as number) >= scoreThreshold,
  );
  const below = opportunities.filter(
    (o) => (o.score as number) < scoreThreshold,
  );

  // Take up to 5 above threshold, backfill with below-threshold
  const selected = above.slice(0, MAX_RESULTS);
  if (selected.length < MAX_RESULTS) {
    const backfillCount = MAX_RESULTS - selected.length;
    selected.push(...below.slice(0, backfillCount));
  }

  // Load analysis summaries for rationale
  const analysisIds = selected
    .map((o) => o.analysis_id as string | null)
    .filter((id): id is string => id != null);

  const rationales: Record<string, string> = {};
  if (analysisIds.length > 0) {
    const { data: analyses } = await svc
      .from("analyses")
      .select("id, result")
      .in("id", analysisIds);

    if (analyses) {
      for (const a of analyses) {
        const result = a.result as Record<string, unknown> | null;
        const raw =
          (result?.bottom_line as string) ??
          (result?.summary as string) ??
          (result?.executive_summary as string) ??
          "";
        if (raw) {
          // Extract first two sentences — the first is often a generic
          // opener ("This is a strong match"), the second has the signal.
          const sentences = raw.match(/[^.!?]+[.!?]+/g) ?? [raw];
          const twoSentences = sentences.slice(0, 2).join(" ").trim();
          rationales[a.id] =
            twoSentences.length > 280
              ? twoSentences.slice(0, 277) + "..."
              : twoSentences;
        }
      }
    }
  }

  return selected.map((o) => ({
    id: o.id as string,
    companyName: o.company_name as string,
    roleTitle: o.role_title as string,
    score: o.score as number,
    jobUrl: o.job_url as string | null,
    postedAt: (o.job_posted_at as string | null) ?? (o.discovered_at as string),
    fitRationale:
      (o.analysis_id ? rationales[o.analysis_id as string] : null) ??
      `Scored ${o.score}/100`,
    isCloseMatch: (o.score as number) < scoreThreshold,
    opportunity: o as OpportunityRow,
  }));
}

// ---------------------------------------------------------------------------
// Shared persistence helper — marks activation complete so the user is
// never redirected back to /activate.
//
// Two callers use this with distinct semantics:
//   - runActivationSearch: marks completion after a successful search run
//   - dismissActivationAction: marks completion as a user escape hatch
//     from the success, empty, or error states
// ---------------------------------------------------------------------------

export async function markActivationComplete(
  svc: SupabaseClient,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await svc
    .from("pipeline_config")
    .update({ activation_completed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No pipeline config found" };
  return { ok: true };
}
