import type { SupabaseClient } from "@supabase/supabase-js";

export const GTM_FIND_CONTACTS_JOB = "gtm-find-contacts";

export async function enqueueGtmFindContactsJob(
  svc: SupabaseClient,
  {
    userId,
    opportunityId,
    skipThreshold = false,
  }: {
    userId: string;
    opportunityId: string;
    skipThreshold?: boolean;
  },
): Promise<{ jobId: string | null; duplicate: boolean }> {
  const { data, error } = await svc
    .from("jobs")
    .insert({
      user_id: userId,
      type: GTM_FIND_CONTACTS_JOB,
      payload: { opportunityId, skipThreshold },
    })
    .select("id")
    .single();

  if (!error && data?.id) {
    pokeWorker().catch(() => {
      /* best-effort */
    });
    return { jobId: data.id as string, duplicate: false };
  }

  if (error?.code === "23505") {
    const { data: existing } = await svc
      .from("jobs")
      .select("id")
      .eq("user_id", userId)
      .eq("type", GTM_FIND_CONTACTS_JOB)
      .eq("status", "pending")
      .eq("payload->>opportunityId", opportunityId)
      .maybeSingle();
    pokeWorker().catch(() => {
      /* best-effort */
    });
    return {
      jobId: (existing?.id as string | undefined) ?? null,
      duplicate: true,
    };
  }

  throw new Error(`Failed to enqueue ${GTM_FIND_CONTACTS_JOB}: ${error?.message}`);
}

async function pokeWorker(): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const invokeSecret = process.env.WORKER_INVOKE_SECRET;
  await fetch(`${appUrl}/api/worker/claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(invokeSecret ? { authorization: `Bearer ${invokeSecret}` } : {}),
    },
    body: JSON.stringify({ types: [GTM_FIND_CONTACTS_JOB] }),
  });
}
