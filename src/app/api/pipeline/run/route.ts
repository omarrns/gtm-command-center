/**
 * POST /api/pipeline/run
 *
 * Manual pipeline trigger from the UI. Authenticated via requireUser() —
 * always scoped to the authenticated user's ID, never client-supplied.
 *
 * Phase 13A: runs via Vercel Workflow for durability. Awaits completion
 * since the UI expects a synchronous summary response.
 */

import { requireUser } from "@/lib/supabase/server";
import { start } from "workflow/api";
import {
  pipelineWorkflow,
  type WorkflowPipelineResult,
} from "@/lib/pipeline/workflow";

export const maxDuration = 300;

export async function POST() {
  const user = await requireUser();

  const run = await start(pipelineWorkflow, [user.id]);
  const result = (await run.returnValue) as WorkflowPipelineResult;

  return Response.json({
    ok: true,
    runId: run.runId,
    summary: {
      discovered: result.discover.inserted,
      scored: result.score.scored,
      researched: result.research.researched,
      enriched: result.enrich.enriched,
      drafted: result.draft.drafted,
      error: result.error,
    },
  });
}
