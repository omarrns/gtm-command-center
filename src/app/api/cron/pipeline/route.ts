/**
 * GET /api/cron/pipeline
 *
 * Daily cron that runs the autonomous pipeline for all configured users.
 * Auth: CRON_SECRET bearer token (fail-closed if missing).
 * Vercel cron schedule: 0 4,16 * * * UTC (every 12 hours).
 *
 * Phase 13A: each user gets an independent Workflow run with its own
 * durability/retry guarantees. No shared 300s timeout across users.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { start } from "workflow/api";
import { pipelineWorkflow } from "@/lib/pipeline/workflow";

export const maxDuration = 60;

export async function GET(request: Request) {
  // Fail-closed: reject if CRON_SECRET is not configured
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const svc = createSupabaseServiceClient();

  // Load all users with pipeline_config
  const { data: configs, error } = await svc
    .from("pipeline_config")
    .select("user_id");

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!configs?.length) {
    return Response.json({
      ok: true,
      processed: 0,
      message: "No configured users",
    });
  }

  // Fire-and-forget: start each user's workflow independently.
  // Each workflow runs with its own durability/retry — no shared timeout.
  const runs: Array<{ userId: string; runId: string; error?: string }> = [];

  for (const { user_id } of configs) {
    try {
      const run = await start(pipelineWorkflow, [user_id]);
      runs.push({ userId: user_id, runId: run.runId });
    } catch (err) {
      runs.push({
        userId: user_id,
        runId: "",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ ok: true, processed: configs.length, runs });
}
