"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { enqueueGtmFindContactsJob } from "@/lib/jobs/gtm-find-contacts";

export async function findContactsForAccountAction(
  opportunityId: string,
): Promise<{ ok: boolean; jobId?: string | null; error?: string }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: opp, error } = await svc
    .from("opportunities")
    .select("id")
    .eq("id", opportunityId)
    .eq("user_id", user.id)
    .in("source", ["theirstack", "exa-dormant"])
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!opp) return { ok: false, error: "Account not found" };

  try {
    const job = await enqueueGtmFindContactsJob(svc, {
      userId: user.id,
      opportunityId,
      skipThreshold: true,
    });
    revalidatePath("/accounts");
    return { ok: true, jobId: job.jobId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
