"use server";

import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { markActivationComplete } from "@/lib/pipeline/activation";

/**
 * User-driven escape hatch: sets activation_completed_at so the user is
 * never redirected back to /activate. Called from the success, empty, and
 * error exit paths in the activation UI.
 */
export async function dismissActivationAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  return markActivationComplete(svc, user.id);
}
