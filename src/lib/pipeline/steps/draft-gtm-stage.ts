import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceStage } from "@/lib/pipeline/opportunities";
import type { OpportunityRow } from "@/lib/supabase/types";

export async function queueExistingGtmDraft(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
  draftId: string,
): Promise<void> {
  const updates = { selected_draft_id: draftId, last_error: null };

  if (opp.stage === "enriched") {
    await advanceStage(svc, opp.id, userId, "enriched", "drafted", updates);
    await advanceStage(svc, opp.id, userId, "drafted", "queued");
    return;
  }

  if (opp.stage === "drafted") {
    await advanceStage(svc, opp.id, userId, "drafted", "queued", updates);
    return;
  }

  if (opp.selected_draft_id === draftId) return;
  const { error } = await svc
    .from("opportunities")
    .update({ selected_draft_id: draftId })
    .eq("id", opp.id)
    .eq("user_id", userId);
  if (error) throw error;
}
