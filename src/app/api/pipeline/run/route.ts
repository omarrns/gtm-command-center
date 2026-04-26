/**
 * POST /api/pipeline/run
 *
 * Manual pipeline trigger from the UI. Authenticated via requireUser() —
 * always scoped to the authenticated user's ID, never client-supplied.
 *
 * Returns 202 immediately after enqueuing the workflow. The workflow runs
 * durably via Vercel Workflow and completes independently of this HTTP request,
 * avoiding the 5-minute Node HTTP header timeout that occurred when waiting
 * for `run.returnValue`.
 */

import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { start } from "workflow/api";
import { pipelineWorkflow } from "@/lib/pipeline/workflow";
import { createLogger, newRunId } from "@/lib/logger";

export const maxDuration = 300;

const GTM_MANUAL_TRIGGER_ERROR =
  "Manual pipeline trigger is for job_seeker persona. GTM users are served by /api/cron/dormant-discover and the TheirStack webhook.";

type StartWorkflow = typeof start;
type RequireUser = typeof requireUser;
let startWorkflow: StartWorkflow = start;
let requireUserForRoute: RequireUser = requireUser;

export function __setPipelineRunRouteDepsForTests(
  deps: { start?: StartWorkflow; requireUser?: RequireUser } | null,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot override pipeline run route deps in production.");
  }
  startWorkflow = deps?.start ?? start;
  requireUserForRoute = deps?.requireUser ?? requireUser;
}

export async function POST() {
  const user = await requireUserForRoute();
  const userRunId = newRunId();
  const log = createLogger({
    runId: userRunId,
    userId: user.id,
    scope: "api.pipeline.run",
  });

  log.info("manual pipeline trigger");
  const svc = createSupabaseServiceClient();
  const { data: profile, error } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    log.error("failed to load profile row", error);
    return Response.json({ ok: false, err: error.message }, { status: 500 });
  }

  if (profile?.user_type === "gtm") {
    log.info("manual pipeline trigger rejected for gtm persona");
    return Response.json(
      { ok: false, err: GTM_MANUAL_TRIGGER_ERROR },
      { status: 400 },
    );
  }

  const run = await startWorkflow(pipelineWorkflow, [user.id, userRunId]);

  return Response.json(
    { ok: true, runId: userRunId, workflowRunId: run.runId },
    { status: 202 },
  );
}
