"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/integrations/gmail";

export async function disconnectGmailAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await requireUser();

  try {
    await revokeToken(user.id);
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Disconnect failed";
    return { ok: false, error: msg };
  }
}
