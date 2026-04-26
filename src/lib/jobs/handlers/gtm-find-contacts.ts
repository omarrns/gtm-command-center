import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { processAccountAfterScore } from "@/lib/pipeline/process-account-after-score";

export async function runGtmFindContactsJob(
  job: JobRow,
  svc: SupabaseClient,
) {
  const payload = job.payload as {
    opportunityId?: string;
    skipThreshold?: boolean;
  };

  if (!payload.opportunityId) {
    throw new Error("gtm-find-contacts job missing opportunityId");
  }

  return processAccountAfterScore(svc, job.user_id, payload.opportunityId, {
    skipThreshold: payload.skipThreshold ?? false,
  });
}
