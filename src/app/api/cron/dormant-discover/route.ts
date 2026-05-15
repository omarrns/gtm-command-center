/**
 * GET /api/cron/dormant-discover
 *
 * Weekly sweep that expands GTM discovery beyond actively-hiring
 * accounts. For every user_type='gtm' profile with a confirmed ICP
 * rubric, runs an Exa search over the firmographic/technographic rubric
 * shape (no hiring signals) and scores the resulting dormant accounts
 * via the same runScoreAccounts step the main pipeline uses.
 *
 * Auth: CRON_SECRET bearer token (fail-closed if missing), matching
 * /api/cron/pipeline's security pattern.
 *
 * Schedule: weekly Monday 12:00 UTC (see vercel.json).
 */

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { safeParseIcpRubric } from "@/lib/onboarding/icp-schemas";
import { runDiscoverDormant } from "@/lib/pipeline/steps/discover-dormant";
import { runScoreAccounts } from "@/lib/pipeline/steps/score-accounts";
import { enqueueGtmFindContactsJob } from "@/lib/jobs/gtm-find-contacts";
import type { PipelineConfigRow } from "@/lib/supabase/types";
import { createLogger, newRunId } from "@/lib/logger";

export const maxDuration = 300;

interface UserResult {
  userId: string;
  discoverFound: number;
  discoverInserted: number;
  scored: number;
  filtered: number;
  contactJobs: number;
  errors: number;
  skipped?: string;
  error?: string;
}

export async function GET(request: Request) {
  const runId = newRunId();
  const log = createLogger({ runId, scope: "cron.dormant-discover" });

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    log.error("CRON_SECRET not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    log.warn("unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  const svc = createSupabaseServiceClient();

  const { data: profiles, error: profilesErr } = await svc
    .from("profiles")
    .select("user_id")
    .eq("user_type", "gtm")
    .eq("is_enabled", true);

  if (profilesErr) {
    log.error("failed to load gtm profiles", profilesErr);
    return Response.json(
      { ok: false, error: profilesErr.message },
      { status: 500 },
    );
  }

  const userIds = (profiles ?? []).map((p) => p.user_id as string);
  if (!userIds.length) {
    log.info("no gtm users configured");
    return Response.json({
      ok: true,
      runId,
      users: 0,
      message: "No gtm users",
    });
  }

  log.info("dispatching dormant sweep", { users: userIds.length });

  const results: UserResult[] = [];

  for (const userId of userIds) {
    const userLog = log.child({ userId });
    const row: UserResult = {
      userId,
      discoverFound: 0,
      discoverInserted: 0,
      scored: 0,
      filtered: 0,
      contactJobs: 0,
      errors: 0,
    };

    try {
      const [scoringRes, configRes] = await Promise.all([
        svc
          .from("user_scoring_profiles")
          .select("icp_rubric")
          .eq("user_id", userId)
          .maybeSingle(),
        svc
          .from("pipeline_config")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      const rawRubric = scoringRes.data?.icp_rubric ?? null;
      const config = configRes.data as PipelineConfigRow | null;

      if (!rawRubric) {
        row.skipped = "no icp_rubric";
        results.push(row);
        continue;
      }
      if (!config) {
        row.skipped = "no pipeline_config";
        results.push(row);
        continue;
      }

      const parsed = safeParseIcpRubric(rawRubric);
      if (!parsed.success) {
        userLog.error("icp_rubric failed schema validation", parsed.error);
        row.skipped = `icp_rubric invalid: ${parsed.error.message}`;
        results.push(row);
        continue;
      }

      const discover = await runDiscoverDormant(
        svc,
        userId,
        parsed.data,
        runId,
      );
      row.discoverFound = discover.found;
      row.discoverInserted = discover.inserted;

      const score = await runScoreAccounts(
        svc,
        userId,
        parsed.data,
        config,
        runId,
      );
      row.scored = score.scored;
      row.filtered = score.filtered;
      row.errors = score.errors;

      for (const opportunityId of score.scoredOpportunityIds) {
        try {
          await enqueueGtmFindContactsJob(svc, {
            userId,
            opportunityId,
          });
          row.contactJobs++;
        } catch (enqueueErr) {
          row.errors++;
          userLog.error("contact discovery enqueue failed", enqueueErr, {
            opportunityId,
          });
        }
      }

      userLog.info("dormant sweep complete", {
        discoverFound: row.discoverFound,
        discoverInserted: row.discoverInserted,
        scored: row.scored,
        filtered: row.filtered,
        contactJobs: row.contactJobs,
        errors: row.errors,
      });
    } catch (err) {
      userLog.error("dormant sweep failed", err);
      row.error = err instanceof Error ? err.message : String(err);
    }

    results.push(row);
  }

  const totals = results.reduce(
    (acc, r) => {
      acc.discoverFound += r.discoverFound;
      acc.discoverInserted += r.discoverInserted;
      acc.scored += r.scored;
      acc.filtered += r.filtered;
      acc.contactJobs += r.contactJobs;
      acc.errors += r.errors;
      return acc;
    },
    {
      discoverFound: 0,
      discoverInserted: 0,
      scored: 0,
      filtered: 0,
      contactJobs: 0,
      errors: 0,
    },
  );

  return Response.json({
    ok: true,
    runId,
    users: userIds.length,
    totals,
    results,
  });
}
