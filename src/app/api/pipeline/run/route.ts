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
import { start } from "workflow/api";
import { pipelineWorkflow } from "@/lib/pipeline/workflow";
import { createLogger, newRunId } from "@/lib/logger";

export const maxDuration = 300;

export async function POST() {
  const user = await requireUser();
  const userRunId = newRunId();
  const log = createLogger({
    runId: userRunId,
    userId: user.id,
    scope: "api.pipeline.run",
  });

  log.info("manual pipeline trigger");
  const run = await start(pipelineWorkflow, [user.id, userRunId]);

  return Response.json(
    { ok: true, runId: userRunId, workflowRunId: run.runId },
    { status: 202 },
  );
}
