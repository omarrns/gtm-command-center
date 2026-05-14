"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { advanceStage } from "@/lib/pipeline/opportunities";
import { addToWatchlist } from "@/lib/pipeline/watchlist";
import { createLogger } from "@/lib/logger";
import { approveOpportunityForSend } from "@/lib/outreach/approve-send";
import {
  manuallyInjectOpportunity,
  type ManualInjectOpportunityResult,
} from "@/lib/pipeline/manual-inject";
import { SKIPPABLE_STAGES } from "@/lib/pipeline/stages";
import type { OpportunityStage } from "@/lib/supabase/types";

export async function triggerPipelineAction(): Promise<{
  ok: boolean;
  error?: string;
  runId?: string;
}> {
  await requireUser();

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  const res = await fetch(`${baseUrl}/api/pipeline/run`, {
    method: "POST",
    headers: { cookie: cookieHeader },
  });

  if (res.status !== 202) {
    return { ok: false, error: `Pipeline returned ${res.status}` };
  }

  const data = await res.json();
  revalidatePath("/career");
  return { ok: true, runId: data.runId };
}

export async function approveOpportunityAction(
  opportunityId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const result = await approveOpportunityForSend({
    userId: user.id,
    userEmail: user.email,
    opportunityId,
  });
  if (result.ok) {
    revalidatePath("/career");
    revalidatePath("/gtm/accounts");
  }
  return result;
}

export async function skipOpportunityAction(
  opportunityId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const log = createLogger({
    scope: "action.skip",
    userId: user.id,
    opportunityId,
  });

  // Get current stage to use as precondition
  const { data: opp, error: fetchError } = await svc
    .from("opportunities")
    .select("stage")
    .eq("id", opportunityId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !opp) {
    log.warn("opportunity not found", { fetchError: fetchError?.message });
    return { ok: false, error: "Opportunity not found" };
  }

  const currentStage = opp.stage as OpportunityStage;
  if (!SKIPPABLE_STAGES.includes(currentStage)) {
    log.warn("skip rejected — non-skippable stage", { currentStage });
    return { ok: false, error: `Cannot skip from stage: ${currentStage}` };
  }

  const advanced = await advanceStage(
    svc,
    opportunityId,
    user.id,
    currentStage,
    "skipped",
  );

  if (!advanced) {
    log.warn("skip stage transition lost a race", { currentStage });
    return { ok: false, error: "Stage changed concurrently, please refresh" };
  }

  log.info("skipped", { fromStage: currentStage });
  revalidatePath("/career");
  revalidatePath("/gtm/accounts");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Edit draft (inline before approving)
// ---------------------------------------------------------------------------

export async function editDraftAction(
  draftId: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const log = createLogger({
    scope: "action.editDraft",
    userId: user.id,
    draftId,
  });

  // Validate ownership
  const { data: draft, error: fetchError } = await svc
    .from("email_drafts")
    .select("id")
    .eq("id", draftId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !draft) {
    log.warn("draft not found");
    return { ok: false, error: "Draft not found" };
  }

  const { error: updateError } = await svc
    .from("email_drafts")
    .update({ subject, body })
    .eq("id", draftId)
    .eq("user_id", user.id);

  if (updateError) {
    log.error("draft update failed", updateError);
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/career");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Flag company (add to watchlist + skip)
// ---------------------------------------------------------------------------

export async function flagCompanyAction(
  opportunityId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const log = createLogger({
    scope: "action.flag",
    userId: user.id,
    opportunityId,
  });

  // Get opportunity for company name and current stage
  const { data: opp, error: fetchError } = await svc
    .from("opportunities")
    .select("company_name, stage")
    .eq("id", opportunityId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !opp) {
    log.warn("opportunity not found");
    return { ok: false, error: "Opportunity not found" };
  }

  // Add to watchlist — fail before skipping if the write itself failed
  const watchlistResult = await addToWatchlist(
    svc,
    user.id,
    opp.company_name,
    "manual",
  );
  if (watchlistResult.status === "error") {
    log.error("watchlist add failed", undefined, {
      message: watchlistResult.message,
    });
    return {
      ok: false,
      error: `Failed to add to watchlist: ${watchlistResult.message}`,
    };
  }

  // Skip the opportunity
  const currentStage = opp.stage as OpportunityStage;
  if (SKIPPABLE_STAGES.includes(currentStage)) {
    const skipped = await advanceStage(
      svc,
      opportunityId,
      user.id,
      currentStage,
      "skipped",
    );
    if (!skipped) {
      log.warn("flagged but skip lost a race", { currentStage });
      return {
        ok: false,
        error:
          "Company watchlisted but skip failed — stage changed concurrently",
      };
    }
  }

  log.info("flagged + skipped", {
    company: opp.company_name,
    fromStage: currentStage,
  });
  revalidatePath("/career");
  revalidatePath("/gtm/accounts");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mark as applied manually (user applied outside the system)
// ---------------------------------------------------------------------------

export async function applyManuallyAction(
  opportunityId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const log = createLogger({
    scope: "action.applyManually",
    userId: user.id,
    opportunityId,
  });

  // Direct update — bypasses advanceStage() since we're jumping straight to
  // "sent" without the Gmail send flow. Guard prevents double-applying
  // opportunities already in a terminal or in-flight state.
  const { data, error } = await svc
    .from("opportunities")
    .update({
      stage: "sent" as OpportunityStage,
      applied_manually: true,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .eq("user_id", user.id)
    .not("stage", "in", "(sent,replied,skipped,sending)")
    .select("id");

  if (error) {
    log.error("update failed", error);
    return { ok: false, error: error.message };
  }
  if (!data?.length) {
    log.warn("not found or terminal");
    return {
      ok: false,
      error: "Opportunity not found or already in a terminal stage",
    };
  }

  log.info("marked sent (manual apply)");
  revalidatePath("/career");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Manually inject a job URL into the pipeline and immediately score it
// ---------------------------------------------------------------------------

export async function manualInjectOpportunityAction(
  jobUrl: string,
): Promise<ManualInjectOpportunityResult> {
  const user = await requireUser();
  const result = await manuallyInjectOpportunity({
    userId: user.id,
    jobUrl,
  });
  if (result.ok) {
    revalidatePath("/career");
  }
  return result;
}
