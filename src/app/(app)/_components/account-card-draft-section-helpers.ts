import type { OpportunityStage } from "@/lib/supabase/types";

export function canApproveAccountDraft({
  draftId,
  opportunityId,
  recipientEmail,
  stage,
}: {
  draftId?: string;
  opportunityId?: string;
  recipientEmail?: string | null;
  stage: OpportunityStage;
}): boolean {
  return !!draftId && !!opportunityId && !!recipientEmail && stage === "queued";
}
