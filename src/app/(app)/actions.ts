"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { advanceStage } from "@/lib/pipeline/opportunities";
import { addToWatchlist } from "@/lib/pipeline/watchlist";
import { getGmailClient, sendEmail } from "@/lib/integrations/gmail";
import type { OpportunityStage } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Trigger pipeline manually (calls /api/pipeline/run with cookie forwarding)
// ---------------------------------------------------------------------------

export async function triggerPipelineAction(): Promise<{
  ok: boolean;
  error?: string;
  runId?: string;
}> {
  // Auth gate — will redirect if not logged in
  await requireUser();

  // Forward auth cookies so the route handler's requireUser() succeeds
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  // Derive the origin from the incoming request headers
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  const res = await fetch(`${baseUrl}/api/pipeline/run`, {
    method: "POST",
    headers: { cookie: cookieHeader },
  });

  // Route returns 202 immediately — the workflow runs durably in the background
  if (res.status !== 202) {
    return { ok: false, error: `Pipeline returned ${res.status}` };
  }

  const data = await res.json();
  revalidatePath("/");
  return { ok: true, runId: data.runId };
}

// ---------------------------------------------------------------------------
// Approve opportunity (Gmail send is Phase 4 — currently gates on connection)
// ---------------------------------------------------------------------------

export async function approveOpportunityAction(
  opportunityId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Check if Gmail is connected
  const { data: gmailCreds } = await svc
    .from("gmail_credentials")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!gmailCreds) {
    return {
      ok: false,
      error: "Gmail not connected. Connect Gmail in Settings to send emails.",
    };
  }

  // Atomic cap check + stage transition via RPC
  const { data: reserved, error: rpcError } = await svc.rpc(
    "reserve_send_slot",
    { p_opportunity_id: opportunityId, p_user_id: user.id },
  );

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  if (!reserved) {
    return {
      ok: false,
      error: "Daily send cap reached or opportunity not queued",
    };
  }

  // Load the selected draft for subject + body + recipient email
  const { data: opp } = await svc
    .from("opportunities")
    .select("selected_draft_id, recipient_email, recipient_name")
    .eq("id", opportunityId)
    .eq("user_id", user.id)
    .single();

  if (!opp?.selected_draft_id || !opp.recipient_email) {
    await advanceStage(svc, opportunityId, user.id, "sending", "queued");
    return { ok: false, error: "Missing draft or recipient email" };
  }

  const { data: draft } = await svc
    .from("email_drafts")
    .select("subject, body")
    .eq("id", opp.selected_draft_id)
    .eq("user_id", user.id)
    .single();

  if (!draft?.subject || !draft.body) {
    await advanceStage(svc, opportunityId, user.id, "sending", "queued");
    return { ok: false, error: "Draft subject or body is empty" };
  }

  // Get the sender address from pipeline_config
  const { data: config } = await svc
    .from("pipeline_config")
    .select("gmail_send_address")
    .eq("user_id", user.id)
    .single();

  const fromAddress = config?.gmail_send_address ?? user.email ?? "";

  // Send via Gmail API
  let threadId: string;
  let messageId: string;
  try {
    const gmail = await getGmailClient(user.id);
    const result = await sendEmail(gmail, {
      to: opp.recipient_email,
      subject: draft.subject,
      body: draft.body,
      from: fromAddress,
    });
    threadId = result.threadId;
    messageId = result.messageId;
  } catch (err) {
    // Gmail send failed — safe to revert to queued for retry
    const errorMsg = err instanceof Error ? err.message : "Gmail send failed";
    console.error("Gmail send failed:", errorMsg);

    await advanceStage(svc, opportunityId, user.id, "sending", "queued", {
      last_error: errorMsg,
    });

    return { ok: false, error: errorMsg };
  }

  // Email was sent — never revert to queued from here (would cause duplicates)
  let advanced = false;
  try {
    advanced = await advanceStage(
      svc,
      opportunityId,
      user.id,
      "sending",
      "sent",
      {
        gmail_thread_id: threadId,
        gmail_message_id: messageId,
        sent_at: new Date().toISOString(),
      },
    );
  } catch (dbErr) {
    console.error(
      `Email sent for ${opportunityId} but post-send DB write threw:`,
      dbErr,
    );
    return {
      ok: false,
      error:
        "Email was sent but status update failed. Check the opportunity manually.",
    };
  }

  if (!advanced) {
    console.error(
      `Email sent for ${opportunityId} but stage transition returned false (precondition miss).`,
    );
    return {
      ok: false,
      error:
        "Email was sent but status update failed. Check the opportunity manually.",
    };
  }

  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Skip opportunity
// ---------------------------------------------------------------------------

const SKIPPABLE_STAGES: OpportunityStage[] = [
  "discovered",
  "scored",
  "filtered",
  "researched",
  "needs_contact",
  "enriched",
  "drafted",
  "queued",
];

export async function skipOpportunityAction(
  opportunityId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Get current stage to use as precondition
  const { data: opp, error: fetchError } = await svc
    .from("opportunities")
    .select("stage")
    .eq("id", opportunityId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !opp) {
    return { ok: false, error: "Opportunity not found" };
  }

  const currentStage = opp.stage as OpportunityStage;
  if (!SKIPPABLE_STAGES.includes(currentStage)) {
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
    return { ok: false, error: "Stage changed concurrently, please refresh" };
  }

  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Update selected draft variant
// ---------------------------------------------------------------------------

export async function updateSelectedDraftAction(
  opportunityId: string,
  draftId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Validate draft belongs to this user AND this opportunity
  const { data: draft, error: draftError } = await svc
    .from("email_drafts")
    .select("id")
    .eq("id", draftId)
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunityId)
    .single();

  if (draftError || !draft) {
    return {
      ok: false,
      error: "Draft not found or does not belong to this opportunity",
    };
  }

  const { error: updateError } = await svc
    .from("opportunities")
    .update({ selected_draft_id: draftId })
    .eq("id", opportunityId)
    .eq("user_id", user.id);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Send with specific draft — selects the draft then approves in one call
// ---------------------------------------------------------------------------

export async function sendWithDraftAction(
  opportunityId: string,
  draftId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Validate draft belongs to this user AND this opportunity
  const { data: draft, error: draftError } = await svc
    .from("email_drafts")
    .select("id")
    .eq("id", draftId)
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunityId)
    .single();

  if (draftError || !draft) {
    return {
      ok: false,
      error: "Draft not found or does not belong to this opportunity",
    };
  }

  const { error: updateError } = await svc
    .from("opportunities")
    .update({ selected_draft_id: draftId })
    .eq("id", opportunityId)
    .eq("user_id", user.id);

  if (updateError) return { ok: false, error: updateError.message };

  // approveOpportunityAction reads selected_draft_id fresh from the DB
  return approveOpportunityAction(opportunityId);
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

  // Validate ownership
  const { data: draft, error: fetchError } = await svc
    .from("email_drafts")
    .select("id")
    .eq("id", draftId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !draft) {
    return { ok: false, error: "Draft not found" };
  }

  const { error: updateError } = await svc
    .from("email_drafts")
    .update({ subject, body })
    .eq("id", draftId)
    .eq("user_id", user.id);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/");
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

  // Get opportunity for company name and current stage
  const { data: opp, error: fetchError } = await svc
    .from("opportunities")
    .select("company_name, stage")
    .eq("id", opportunityId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !opp) {
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
      return {
        ok: false,
        error:
          "Company watchlisted but skip failed — stage changed concurrently",
      };
    }
  }

  revalidatePath("/");
  return { ok: true };
}
