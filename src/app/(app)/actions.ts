"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { advanceStage, createOpportunity } from "@/lib/pipeline/opportunities";
import { addToWatchlist } from "@/lib/pipeline/watchlist";
import { getGmailClient, sendEmail } from "@/lib/integrations/gmail";
import { scoreOneOpportunity } from "@/lib/pipeline/steps/score";
import { firecrawlScrape } from "@/lib/ai/firecrawl";
import { runClaudeJson } from "@/lib/ai/anthropic";
import { createLogger } from "@/lib/logger";
import type { OpportunityStage, PipelineConfigRow } from "@/lib/supabase/types";

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
  const log = createLogger({
    scope: "action.approve",
    userId: user.id,
    opportunityId,
  });

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
    log.error("gmail send failed; reverting to queued", err);

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
    log.error("RECONCILE: email sent but post-send DB write threw", dbErr, {
      gmailThreadId: threadId,
      gmailMessageId: messageId,
    });
    return {
      ok: false,
      error:
        "Email was sent but status update failed. Check the opportunity manually.",
    };
  }

  if (!advanced) {
    log.error(
      "RECONCILE: email sent but stage transition returned false (precondition miss)",
      undefined,
      { gmailThreadId: threadId, gmailMessageId: messageId },
    );
    return {
      ok: false,
      error:
        "Email was sent but status update failed. Check the opportunity manually.",
    };
  }

  log.info("opportunity sent", {
    gmailThreadId: threadId,
    gmailMessageId: messageId,
  });
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

// ---------------------------------------------------------------------------
// Mark as applied manually (user applied outside the system)
// ---------------------------------------------------------------------------

export async function applyManuallyAction(
  opportunityId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

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

  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return {
      ok: false,
      error: "Opportunity not found or already in a terminal stage",
    };
  }

  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Manually inject a job URL into the pipeline and immediately score it
// ---------------------------------------------------------------------------

export async function manualInjectOpportunityAction(jobUrl: string): Promise<{
  ok: boolean;
  error?: string;
  score?: number;
  stage?: string;
  companyName?: string;
  roleTitle?: string;
}> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: config, error: configError } = await svc
    .from("pipeline_config")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (configError || !config) {
    return { ok: false, error: "Pipeline config not found" };
  }

  let markdown: string;
  try {
    markdown = await firecrawlScrape(jobUrl);
  } catch (err) {
    return {
      ok: false,
      error: `Could not fetch the job page: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!markdown.trim()) {
    return { ok: false, error: "Job page returned empty content" };
  }

  const parsed = await runClaudeJson<{
    company_name: string;
    role_title: string;
  }>({
    system:
      "Extract the hiring company name and exact job title from the job posting. Return JSON with keys company_name and role_title only.",
    prompt: markdown.slice(0, 8000),
    model: "claude-haiku-4-5-20251001",
    maxTokens: 128,
  });

  const opp = await createOpportunity(svc, user.id, {
    source: "manual",
    external_id: jobUrl,
    company_name: parsed.company_name,
    role_title: parsed.role_title,
    job_url: jobUrl,
    job_description: markdown,
  });

  if (!opp) {
    return {
      ok: false,
      error: "Duplicate — this role was already added within the last 30 days",
    };
  }

  const { newStage, normalizedScore } = await scoreOneOpportunity(
    svc,
    user.id,
    opp,
    config as PipelineConfigRow,
    { source: "manual" },
  );

  revalidatePath("/");
  return {
    ok: true,
    score: normalizedScore,
    stage: newStage,
    companyName: parsed.company_name,
    roleTitle: parsed.role_title,
  };
}
