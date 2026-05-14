import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  recordOutreachEvent,
  type RecordOutreachEventInput,
} from "@/lib/outreach/events";
import type { OpportunityStage } from "@/lib/supabase/types";

export const accountOutcomeSchema = z.enum([
  "positive_reply",
  "bad_fit",
  "not_icp",
  "booked",
  "manual_conversion",
]);

export type AccountOutcome = z.infer<typeof accountOutcomeSchema>;

const recordAccountOutcomeInputSchema = z.object({
  userId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  emailDraftId: z.string().uuid().optional(),
  outcome: accountOutcomeSchema,
});

type OutreachEventRecorder = (
  svc: SupabaseClient,
  input: RecordOutreachEventInput,
) => Promise<unknown>;

interface RecordAccountOutcomeInput {
  userId: string;
  opportunityId: string;
  emailDraftId?: string;
  outcome: unknown;
}

interface AccountOpportunity {
  id: string;
  source: string;
  stage: OpportunityStage;
  selected_draft_id: string | null;
}

export async function recordAccountOutcomeForUser(
  svc: SupabaseClient,
  input: RecordAccountOutcomeInput,
  recorder: OutreachEventRecorder = recordOutreachEvent,
): Promise<{ ok: boolean; error?: string }> {
  const parsedInput = recordAccountOutcomeInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: "Invalid account outcome request" };
  }
  const request = parsedInput.data;

  const { data: opportunity, error } = await svc
    .from("opportunities")
    .select("id, source, stage, selected_draft_id")
    .eq("id", request.opportunityId)
    .eq("user_id", request.userId)
    .maybeSingle<AccountOpportunity>();

  if (error) return { ok: false, error: error.message };
  if (!opportunity) return { ok: false, error: "Account not found" };

  if (
    opportunity.source !== "theirstack" &&
    opportunity.source !== "exa-dormant"
  ) {
    return { ok: false, error: "Account outcome is only available for GTM accounts" };
  }

  if (opportunity.stage === "sending") {
    return { ok: false, error: "Wait for the send to finish before marking an outcome" };
  }

  try {
    await recorder(svc, {
      userId: request.userId,
      opportunityId: request.opportunityId,
      emailDraftId: opportunity.selected_draft_id ?? undefined,
      eventType: "manual_outcome",
      source: "accounts",
      metadata: { outcome: request.outcome },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return { ok: true };
}
