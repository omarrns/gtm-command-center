"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { icpRubricSchema } from "@/lib/onboarding/icp-schemas";

// Inline rubric edits from the GTM dashboard. Validates against the shared
// icpRubricSchema (all keys optional) and upserts the full rubric. The
// memory_documents snapshots (company_icp / icp_proof_points /
// icp_disqualifiers) are NOT synced here — they're written once at onboard
// confirm and no longer read at runtime; rubric is the live source of truth.

export async function updateIcpRubricAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  const parsed = icpRubricSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid rubric shape" };
  }

  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("user_scoring_profiles")
    .upsert(
      { user_id: user.id, icp_rubric: parsed.data },
      { onConflict: "user_id" },
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true };
}
