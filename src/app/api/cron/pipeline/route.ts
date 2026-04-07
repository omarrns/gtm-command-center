/**
 * GET /api/cron/pipeline
 *
 * Daily cron that runs the autonomous pipeline for all configured users.
 * Auth: CRON_SECRET bearer token (fail-closed if missing).
 * Vercel cron schedule: 0 10 * * * UTC (6 AM EDT).
 */

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runPipeline, type PipelineRunResult } from "@/lib/pipeline/runner";

export const maxDuration = 300;

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

  const results: Array<{ userId: string; summary: PipelineRunSummary }> = [];

  for (const { user_id } of configs) {
    try {
      const result = await runPipeline(svc, user_id);
      results.push({ userId: user_id, summary: summarize(result) });
    } catch (err) {
      results.push({
        userId: user_id,
        summary: {
          error: err instanceof Error ? err.message : String(err),
          discovered: 0,
          scored: 0,
          researched: 0,
          enriched: 0,
          drafted: 0,
        },
      });
    }
  }

  return Response.json({ ok: true, processed: configs.length, results });
}

interface PipelineRunSummary {
  discovered: number;
  scored: number;
  researched: number;
  enriched: number;
  drafted: number;
  error: string | null;
}

function summarize(result: PipelineRunResult): PipelineRunSummary {
  return {
    discovered: result.discover.inserted,
    scored: result.score.scored,
    researched: result.research.researched,
    enriched: result.enrich.enriched,
    drafted: result.draft.drafted,
    error: result.error,
  };
}
