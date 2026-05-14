import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVATION_IN_PROGRESS_STATUS = "in_progress";

export async function claimActivationRun(
  svc: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await svc.rpc("claim_activation_run", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`claimActivationRun failed: ${error.message}`);
  }

  return data === true;
}

export async function clearActivationRun(
  svc: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await svc
    .from("pipeline_config")
    .update({ activation_started_at: null })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`clearActivationRun failed: ${error.message}`);
  }
}
