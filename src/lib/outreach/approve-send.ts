import type { SupabaseClient } from "@supabase/supabase-js";
import { getGmailClient, sendEmail } from "@/lib/integrations/gmail";
import { createLogger, type Logger } from "@/lib/logger";
import { recordOutreachEvent } from "@/lib/outreach/events";
import { advanceStage } from "@/lib/pipeline/opportunities";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type ActionResult = { ok: boolean; error?: string };
type GmailClient = unknown;
type SendEmailInput = Parameters<typeof sendEmail>[1];
type SendEmailResult = Awaited<ReturnType<typeof sendEmail>>;
type StageAdvance = typeof advanceStage;
type RecordSentEvent = typeof recordOutreachEvent;

export interface ApproveOpportunityForSendInput {
  userId: string;
  userEmail?: string | null;
  opportunityId: string;
}

export interface ApproveOpportunityForSendDeps {
  svc?: SupabaseClient;
  log?: Logger;
  now?: () => Date;
  advanceStageImpl?: StageAdvance;
  getGmailClientImpl?: (userId: string) => Promise<GmailClient>;
  sendEmailImpl?: (
    gmail: GmailClient,
    input: SendEmailInput,
  ) => Promise<SendEmailResult>;
  recordOutreachEventImpl?: RecordSentEvent;
}

interface ApproveSendContext extends ApproveOpportunityForSendInput {
  svc: SupabaseClient;
  log: Logger;
  now: () => Date;
  advanceStageImpl: StageAdvance;
  getGmailClientImpl: (userId: string) => Promise<GmailClient>;
  sendEmailImpl: (
    gmail: GmailClient,
    input: SendEmailInput,
  ) => Promise<SendEmailResult>;
  recordOutreachEventImpl: RecordSentEvent;
}

interface LoadedSendInput {
  draftId: string;
  to: string;
  subject: string;
  body: string;
  from: string;
}

interface SentIds {
  threadId: string;
  messageId: string;
}

type ResultWithValue<T> = { ok: true; value: T } | { ok: false; error: string };

interface DraftRow {
  subject?: string | null;
  body?: string | null;
}

interface OpportunitySendRow {
  selected_draft_id?: string | null;
  recipient_email?: string | null;
}

const RECONCILIATION_ERROR =
  "Email was sent but status update failed. Check the opportunity manually.";

export async function approveOpportunityForSend(
  input: ApproveOpportunityForSendInput,
  deps: ApproveOpportunityForSendDeps = {},
): Promise<ActionResult> {
  const ctx = resolveApproveSendContext(input, deps);
  if (!(await hasGmailCredentials(ctx))) {
    return {
      ok: false,
      error: "Gmail not connected. Connect Gmail in Settings to send emails.",
    };
  }

  const reservation = await reserveSendSlot(ctx);
  if (!reservation.ok) return reservation;

  const sendInput = await loadSendInput(ctx);
  if (!sendInput.ok) return { ok: false, error: sendInput.error };

  const sentIds = await sendApprovedEmail(ctx, sendInput.value);
  if (!sentIds.ok) return { ok: false, error: sentIds.error };

  const advanced = await advanceSentOrReconcile(ctx, sentIds.value);
  if (!advanced.ok) return advanced;

  await recordSentEventBestEffort(ctx, sendInput.value, sentIds.value);
  ctx.log.info("opportunity sent", {
    gmailThreadId: sentIds.value.threadId,
    gmailMessageId: sentIds.value.messageId,
  });
  return { ok: true };
}

function resolveApproveSendContext(
  input: ApproveOpportunityForSendInput,
  deps: ApproveOpportunityForSendDeps,
): ApproveSendContext {
  const svc = deps.svc ?? createSupabaseServiceClient();
  const log =
    deps.log ??
    createLogger({
      scope: "outreach.approveSend",
      userId: input.userId,
      opportunityId: input.opportunityId,
    });
  const now = deps.now ?? (() => new Date());
  const advanceStageImpl = deps.advanceStageImpl ?? advanceStage;
  const getGmailClientImpl =
    deps.getGmailClientImpl ??
    ((userId: string) => getGmailClient(userId) as Promise<GmailClient>);
  const sendEmailImpl =
    deps.sendEmailImpl ??
    ((gmail: GmailClient, emailInput: SendEmailInput) =>
      sendEmail(
        gmail as Awaited<ReturnType<typeof getGmailClient>>,
        emailInput,
      ));
  const recordOutreachEventImpl =
    deps.recordOutreachEventImpl ?? recordOutreachEvent;

  return {
    ...input,
    svc,
    log,
    now,
    advanceStageImpl,
    getGmailClientImpl,
    sendEmailImpl,
    recordOutreachEventImpl,
  };
}

async function hasGmailCredentials(ctx: ApproveSendContext): Promise<boolean> {
  const { data: gmailCreds } = await ctx.svc
    .from("gmail_credentials")
    .select("id")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  return Boolean(gmailCreds);
}

async function reserveSendSlot(ctx: ApproveSendContext): Promise<ActionResult> {
  const { data: reserved, error: rpcError } = await ctx.svc.rpc(
    "reserve_send_slot",
    { p_opportunity_id: ctx.opportunityId, p_user_id: ctx.userId },
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

  return { ok: true };
}

async function loadSendInput(
  ctx: ApproveSendContext,
): Promise<ResultWithValue<LoadedSendInput>> {
  const opp = await loadOpportunitySendRow(ctx);
  if (!opp?.selected_draft_id || !opp.recipient_email) {
    await revertToQueued(ctx);
    return { ok: false, error: "Missing draft or recipient email" };
  }

  const draft = await loadEmailDraft(ctx, opp.selected_draft_id);
  if (!draft?.subject || !draft.body) {
    await revertToQueued(ctx);
    return { ok: false, error: "Draft subject or body is empty" };
  }

  return {
    ok: true,
    value: {
      draftId: opp.selected_draft_id,
      to: opp.recipient_email,
      subject: draft.subject,
      body: draft.body,
      from: await loadSenderAddress(ctx),
    },
  };
}

async function loadOpportunitySendRow(
  ctx: ApproveSendContext,
): Promise<OpportunitySendRow | null> {
  const { data } = await ctx.svc
    .from("opportunities")
    .select("selected_draft_id, recipient_email, recipient_name")
    .eq("id", ctx.opportunityId)
    .eq("user_id", ctx.userId)
    .single();

  return data as OpportunitySendRow | null;
}

async function loadEmailDraft(
  ctx: ApproveSendContext,
  draftId: string,
): Promise<DraftRow | null> {
  const { data } = await ctx.svc
    .from("email_drafts")
    .select("subject, body")
    .eq("id", draftId)
    .eq("user_id", ctx.userId)
    .single();

  return data as DraftRow | null;
}

async function loadSenderAddress(ctx: ApproveSendContext): Promise<string> {
  const { data: config } = await ctx.svc
    .from("pipeline_config")
    .select("gmail_send_address")
    .eq("user_id", ctx.userId)
    .single();

  return config?.gmail_send_address ?? ctx.userEmail ?? "";
}

async function sendApprovedEmail(
  ctx: ApproveSendContext,
  sendInput: LoadedSendInput,
): Promise<ResultWithValue<SentIds>> {
  try {
    const gmail = await ctx.getGmailClientImpl(ctx.userId);
    const result = await ctx.sendEmailImpl(gmail, {
      to: sendInput.to,
      subject: sendInput.subject,
      body: sendInput.body,
      from: sendInput.from,
    });
    return { ok: true, value: result };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Gmail send failed";
    ctx.log.error("gmail send failed; reverting to queued", err);
    await revertToQueued(ctx, errorMsg);
    return { ok: false, error: errorMsg };
  }
}

async function revertToQueued(
  ctx: ApproveSendContext,
  errorMsg?: string,
): Promise<void> {
  const updates = errorMsg ? { last_error: errorMsg } : {};
  await ctx.advanceStageImpl(
    ctx.svc,
    ctx.opportunityId,
    ctx.userId,
    "sending",
    "queued",
    updates,
  );
}

async function advanceSentOrReconcile(
  ctx: ApproveSendContext,
  sentIds: SentIds,
): Promise<ActionResult> {
  try {
    const advanced = await ctx.advanceStageImpl(
      ctx.svc,
      ctx.opportunityId,
      ctx.userId,
      "sending",
      "sent",
      {
        gmail_thread_id: sentIds.threadId,
        gmail_message_id: sentIds.messageId,
        sent_at: ctx.now().toISOString(),
      },
    );
    if (advanced) return { ok: true };
  } catch (dbErr) {
    ctx.log.error("RECONCILE: email sent but post-send DB write threw", dbErr, {
      gmailThreadId: sentIds.threadId,
      gmailMessageId: sentIds.messageId,
    });
    return { ok: false, error: RECONCILIATION_ERROR };
  }

  ctx.log.error(
    "RECONCILE: email sent but stage transition returned false (precondition miss)",
    undefined,
    { gmailThreadId: sentIds.threadId, gmailMessageId: sentIds.messageId },
  );
  return { ok: false, error: RECONCILIATION_ERROR };
}

async function recordSentEventBestEffort(
  ctx: ApproveSendContext,
  sendInput: LoadedSendInput,
  sentIds: SentIds,
): Promise<void> {
  await ctx.recordOutreachEventImpl(ctx.svc, {
    userId: ctx.userId,
    opportunityId: ctx.opportunityId,
    emailDraftId: sendInput.draftId,
    eventType: "sent",
    source: "approve_send_action",
    metadata: {
      gmailThreadId: sentIds.threadId,
      gmailMessageId: sentIds.messageId,
    },
  }).catch((eventErr) => {
    ctx.log.warn("failed to record sent outreach event", {
      error: eventErr instanceof Error ? eventErr.message : String(eventErr),
      gmailThreadId: sentIds.threadId,
      gmailMessageId: sentIds.messageId,
    });
  });
}
