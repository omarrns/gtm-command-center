"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { icpNarrativeArcSchema } from "@/lib/onboarding/icp-narrative-schema";
import { formatIcpNarrativeAsMarkdown } from "@/lib/onboarding/templates/icp-definition/narrative-formatter";

type UpdateIcpNarrativeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateIcpNarrativeArcAction(
  input: unknown,
): Promise<UpdateIcpNarrativeResult> {
  const user = await requireUser();
  const parsed = icpNarrativeArcSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid narrative shape" };
  }

  const content = formatIcpNarrativeAsMarkdown(parsed.data);
  if (!content) {
    return { ok: false, error: "Narrative cannot be empty" };
  }

  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("memory_documents").upsert(
    {
      user_id: user.id,
      document_key: "icp_narrative_arc",
      title: "ICP Narrative Arc",
      origin: "onboarding",
      content,
      metadata: { edited_from: "icp_dashboard" },
    },
    { onConflict: "user_id,document_key" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/gtm/icp");
  revalidatePath("/gtm/messaging");
  return { ok: true };
}
