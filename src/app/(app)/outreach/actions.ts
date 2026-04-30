"use server";

import { requireUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { MODELS, runClaudeJson } from "@/lib/ai/anthropic";
import { loadMemoryContext } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import {
  buildEmailB2bCustomerSupportSystem,
  buildEmailB2bCustomerSupportPrompt,
} from "@/lib/skills/prompts/email-b2b-customer-support";

export async function generateEmailDraftAction(formData: FormData) {
  const user = await requireUser();
  const draftType = String(formData.get("draft_type") ?? "").trim();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const recipientName = String(formData.get("recipient_name") ?? "").trim();
  const recipientTitle = String(formData.get("recipient_title") ?? "").trim();
  const roleTitle =
    String(formData.get("role_title") ?? "").trim() || undefined;
  const analysisId = String(formData.get("analysis_id") ?? "").trim() || null;

  if (!draftType) return { error: "Draft type is required." };
  if (!companyName) return { error: "Company name is required." };
  if (!recipientName) return { error: "Recipient name is required." };

  const [ctx, supabase] = await Promise.all([
    loadMemoryContext(user.id),
    createSupabaseServerClient(),
  ]);

  // Load linked analysis context if provided
  let analysisContext: string | undefined;
  if (analysisId) {
    const { data } = await supabase
      .from("analyses")
      .select("result")
      .eq("id", analysisId)
      .eq("user_id", user.id)
      .single();
    if (data?.result) {
      analysisContext = JSON.stringify(data.result, null, 2).slice(0, 3000);
    }
  }

  const sender = extractSenderIdentity(ctx, ctx.displayName);

  const result = await runClaudeJson<{
    subject: string;
    body: string;
    reasoning: string;
  }>({
    system: buildEmailB2bCustomerSupportSystem(sender),
    prompt: buildEmailB2bCustomerSupportPrompt({
      companyName,
      recipientName,
      recipientTitle,
      roleTitle,
      analysisContext,
      senderProfile: ctx.profile,
      outreachStyle: ctx.outreachStyle,
    }),
    model: MODELS.sonnet,
    maxTokens: 4096,
    scope: {
      userId: user.id,
      ...(analysisId
        ? { scopeTable: "analyses", scopeId: analysisId }
        : {}),
      callPurpose: "standalone_outreach_draft",
    },
  });

  if (!result.subject || !result.body) {
    return { error: "Draft output missing subject or body." };
  }

  const { data, error } = await supabase
    .from("email_drafts")
    .insert({
      user_id: user.id,
      draft_type: "email-b2b-customer-support",
      company_name: companyName,
      recipient_name: recipientName,
      recipient_title: recipientTitle,
      context: { role_title: roleTitle, reasoning: result.reasoning },
      subject: result.subject,
      body: result.body,
      variant_index: 0,
      status: "draft",
      source_analysis_id: analysisId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  return { draftIds: [data.id], recommendedVariant: 0 };
}

export async function saveEmailDraftAction(formData: FormData) {
  const user = await requireUser();
  const draftId = String(formData.get("draft_id") ?? "").trim();
  const subject = String(formData.get("subject") ?? "");
  const body = String(formData.get("body") ?? "");

  if (!draftId) return { error: "Draft ID required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("email_drafts")
    .update({ subject, body, status: "saved" })
    .eq("id", draftId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { saved: true };
}
