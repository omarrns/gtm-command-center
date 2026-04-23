/**
 * GET /api/cron/pipeline
 *
 * Daily cron that runs the autonomous pipeline for all configured users.
 * Auth: CRON_SECRET bearer token (fail-closed if missing).
 * Vercel cron schedule: 0 4,10,16,22 * * * UTC (every 6 hours).
 *
 * Phase 13A: each user gets an independent Workflow run with its own
 * durability/retry guarantees. No shared 300s timeout across users.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { start } from "workflow/api";
import { pipelineWorkflow } from "@/lib/pipeline/workflow";
import { createLogger, newRunId } from "@/lib/logger";

export const maxDuration = 60;

export async function GET(request: Request) {
  // The cron handler itself doesn't get a runId. It's a thin dispatch shell —
  // each user's workflow gets its own runId and that's the load-bearing ID
  // for grep-based correlation. Vercel's function logs cover the dispatch
  // shell's own failures (auth, DB query) at request granularity.
  const log = createLogger({ scope: "cron.pipeline" });

  // Fail-closed: reject if CRON_SECRET is not configured
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

  // Load all users with pipeline_config
  const { data: configs, error } = await svc
    .from("pipeline_config")
    .select("user_id");

  if (error) {
    log.error("failed to load pipeline_config rows", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!configs?.length) {
    log.info("no configured users");
    return Response.json({
      ok: true,
      processed: 0,
      message: "No configured users",
    });
  }

  log.info("dispatching workflows", { users: configs.length });

  // Fire-and-forget: start each user's workflow independently.
  // Each workflow runs with its own durability/retry — no shared timeout.
  // Each user gets a per-user runId so their logs can be correlated end-to-end.
  const runs: Array<{ userId: string; runId: string; error?: string }> = [];

  for (const { user_id } of configs) {
    const userRunId = newRunId();
    try {
      await start(pipelineWorkflow, [user_id, userRunId]);
      log.info("workflow dispatched", { userId: user_id, runId: userRunId });
      runs.push({ userId: user_id, runId: userRunId });
    } catch (err) {
      log.error("workflow dispatch failed", err, {
        userId: user_id,
        runId: userRunId,
      });
      runs.push({
        userId: user_id,
        runId: userRunId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ ok: true, processed: configs.length, runs });
}
