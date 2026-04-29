/**
 * POST /api/activation/accounts
 *
 * GTM persona's activation fast-preview. Loads the confirmed icp_rubric,
 * calls TheirStack with a capped filter set, scores the candidates
 * inline against the 6-dimension scorecard, and returns the top 5.
 *
 * Auth: requireUser() — user-initiated, not a cron. Response shape
 * matches AccountActivationSearchResult so activation-client can render
 * it without server-side work.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runAccountActivationSearch } from "@/lib/pipeline/activation-accounts";
import { runExistingAccountActivationSearch } from "@/lib/pipeline/activation-existing-accounts";
import { safeParseIcpRubric } from "@/lib/onboarding/icp-schemas";
import { createLogger } from "@/lib/logger";

export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const searchParams = new URL(request.url).searchParams;
  const source = searchParams.get("source");
  const limit = parseLimit(searchParams.get("limit"));
  const log = createLogger({
    userId: user.id,
    scope: "api.activation.accounts",
  });
  log.info("activation accounts request started", {
    source: source === "existing" ? "existing" : "live",
  });

  const { data: scoringProfile, error } = await svc
    .from("user_scoring_profiles")
    .select("icp_rubric")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to load icp_rubric: ${error.message}` },
      { status: 500 },
    );
  }

  const rawRubric = scoringProfile?.icp_rubric ?? null;
  if (!rawRubric) {
    return NextResponse.json(
      { error: "No confirmed ICP rubric — complete onboarding first" },
      { status: 400 },
    );
  }

  const parsed = safeParseIcpRubric(rawRubric);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `icp_rubric failed validation: ${parsed.error.message}` },
      { status: 500 },
    );
  }

  try {
    const result =
      source === "existing"
        ? await runExistingAccountActivationSearch(
            svc,
            user.id,
            parsed.data,
            undefined,
            limit,
          )
        : await runAccountActivationSearch(svc, user.id, parsed.data);
    log.info("activation accounts request complete", {
      source: source === "existing" ? "existing" : "live",
      discovered: result.stats.discovered,
      scored: result.stats.scored,
      errors: result.stats.errors,
      firstError: result.stats.firstError,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error("activation accounts request failed", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Account activation failed",
      },
      { status: 500 },
    );
  }
}

function parseLimit(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
