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
import { icpRubricSchema } from "@/lib/onboarding/icp-schemas";

export const maxDuration = 300;

export async function POST() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

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

  const parsed = icpRubricSchema.safeParse(rawRubric);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `icp_rubric failed validation: ${parsed.error.message}` },
      { status: 500 },
    );
  }

  try {
    const result = await runAccountActivationSearch(svc, user.id, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[activation/accounts] Error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Account activation failed",
      },
      { status: 500 },
    );
  }
}
