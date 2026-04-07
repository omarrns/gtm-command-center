/**
 * POST /api/pipeline/run
 *
 * Manual pipeline trigger from the UI. Authenticated via requireUser() —
 * always scoped to the authenticated user's ID, never client-supplied.
 */

import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runPipeline } from "@/lib/pipeline/runner";

export const maxDuration = 300;

export async function POST() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const result = await runPipeline(svc, user.id);

  return Response.json({
    ok: true,
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
