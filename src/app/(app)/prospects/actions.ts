"use server";

import { revalidatePath } from "next/cache";
import { enqueueScoreYoutubeProspectsJob } from "@/lib/jobs/score-youtube-prospects";
import { promoteProspectToOpportunity } from "@/lib/prospects/promotion";
import type { ProspectRow } from "@/lib/prospects/types";
import type { PipelineConfigRow } from "@/lib/supabase/types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/supabase/server";

export async function dismissProspectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const prospectId = String(formData.get("prospect_id") ?? "");
  const svc = createSupabaseServiceClient();

  if (!prospectId) return;
  await svc
    .from("prospects")
    .update({ status: "dismissed" })
    .eq("id", prospectId)
    .eq("user_id", user.id);

  revalidatePath("/prospects");
  revalidatePath("/video-icp");
}

export async function promoteProspectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const prospectId = String(formData.get("prospect_id") ?? "");
  const svc = createSupabaseServiceClient();
  if (!prospectId) return;

  const [prospect, config] = await Promise.all([
    loadProspect(svc, user.id, prospectId),
    loadPipelineConfig(svc, user.id),
  ]);
  await promoteProspectToOpportunity({ svc, userId: user.id, prospect, config });

  revalidatePath("/prospects");
  revalidatePath("/accounts");
  revalidatePath("/video-icp");
}

export async function scoreReviewProspectsAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const reviewId = String(formData.get("review_id") ?? "");
  if (!reviewId) return;

  const svc = createSupabaseServiceClient();
  await enqueueScoreYoutubeProspectsJob(svc, {
    userId: user.id,
    reviewId,
  });

  revalidatePath(`/video-icp/${reviewId}`);
  revalidatePath("/prospects");
}

async function loadProspect(
  svc: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
  prospectId: string,
): Promise<ProspectRow> {
  const { data, error } = await svc
    .from("prospects")
    .select("*")
    .eq("id", prospectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load prospect: ${error.message}`);
  if (!data) throw new Error("Prospect not found.");
  return data as ProspectRow;
}

async function loadPipelineConfig(
  svc: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
): Promise<PipelineConfigRow> {
  const { data, error } = await svc
    .from("pipeline_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load pipeline config: ${error.message}`);
  if (!data) throw new Error("No pipeline config found.");
  return data as PipelineConfigRow;
}
