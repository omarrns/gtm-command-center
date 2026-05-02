import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutreachEventType } from "@/lib/supabase/types";

export type ManualOutcome =
  | "positive_reply"
  | "bad_fit"
  | "not_icp"
  | "booked"
  | "manual_conversion";

export interface ManualOutcomeMetadata {
  outcome: ManualOutcome;
  note?: string;
}

export interface RecordOutreachEventInput {
  userId: string;
  opportunityId: string;
  emailDraftId?: string;
  eventType: OutreachEventType;
  source: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

export async function recordOutreachEvent(
  svc: SupabaseClient,
  input: RecordOutreachEventInput,
): Promise<void> {
  const row: Record<string, unknown> = {
    user_id: input.userId,
    opportunity_id: input.opportunityId,
    event_type: input.eventType,
    source: input.source,
    metadata: input.metadata ?? {},
  };

  if (input.emailDraftId !== undefined) {
    row.email_draft_id = input.emailDraftId;
  }
  if (input.occurredAt !== undefined) {
    row.occurred_at = input.occurredAt;
  }

  const { error } = await svc.from("outreach_events").insert(row);
  if (error) {
    throw new Error(`recordOutreachEvent failed: ${error.message}`);
  }
}
