"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { asJson } from "@/lib/supabase/schema";
import { safeParseIcpRubric } from "@/lib/onboarding/icp-schemas";
import {
  ICP_DIMENSIONS,
  changedSubDimensionKeys,
  type IcpEvidence,
  type IcpRubric,
} from "@/lib/onboarding/icp-dimensions";

// Inline rubric edits from the GTM dashboard. Validates against the shared
// icpRubricSchema (all keys optional) and upserts the full rubric. The
// memory_documents snapshots (company_icp / icp_proof_points /
// icp_disqualifiers) are NOT synced here — they're written once at onboard
// confirm and no longer read at runtime; rubric is the live source of truth.

export async function updateIcpRubricAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  const parsed = safeParseIcpRubric(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid rubric shape" };
  }

  const svc = createSupabaseServiceClient();

  const { data: existing } = await svc
    .from("user_scoring_profiles")
    .select("icp_rubric")
    .eq("user_id", user.id)
    .maybeSingle();
  const existingRubric = existing?.icp_rubric
    ? safeParseIcpRubric(existing.icp_rubric)
    : null;
  const nextRubric: IcpRubric = {
    ...parsed.data,
    evidence: mergeDashboardEvidence(
      existingRubric?.success === true ? existingRubric.data : null,
      parsed.data,
    ),
  };

  const { error } = await svc
    .from("user_scoring_profiles")
    .upsert(
      { user_id: user.id, icp_rubric: asJson(nextRubric) },
      { onConflict: "user_id" },
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true };
}

function mergeDashboardEvidence(
  existing: IcpRubric | null,
  next: IcpRubric,
): IcpEvidence {
  const evidence = existing?.evidence ?? next.evidence;
  if (!existing) return evidence;

  const merged: IcpEvidence = {
    product: { ...evidence.product },
    buyer: { ...evidence.buyer },
    firmographics: { ...evidence.firmographics },
    technographics: { ...evidence.technographics },
    signals: { ...evidence.signals },
    disqualifiers: { ...evidence.disqualifiers },
  };

  for (const dimension of ICP_DIMENSIONS) {
    const changedFields = changedSubDimensionKeys(
      dimension.key,
      existing[dimension.key],
      next[dimension.key],
    );
    for (const field of changedFields) {
      const writable = merged[dimension.key] as Record<string, unknown>;
      writable[field] = {
        strength: "direct_user_provided",
        proofPoints: [],
        sources: [{ type: "user_answer", label: "dashboard edit" }],
        notes: "Confirmed by dashboard edit.",
      };
    }
  }

  return merged;
}
