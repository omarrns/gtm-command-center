"use server";

import { requireUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { runClaudeJson } from "@/lib/ai/anthropic";
import { loadMemoryContext } from "@/lib/skills/context";
import {
  EMAIL_B2B_CUSTOMER_SUPPORT_SYSTEM,
  buildEmailB2bCustomerSupportPrompt,
} from "@/lib/skills/prompts/email-b2b-customer-support";
import {
  EMAIL_HEAD_OF_GROWTH_SYSTEM,
  buildEmailHeadOfGrowthPrompt,
} from "@/lib/skills/prompts/email-head-of-growth";

interface DraftVariant {
  variant_name: string;
  subject: string;
  body: string;
  reasoning: string;
}

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

  // Choose skill
  const isCxCeo = draftType === "email-b2b-customer-support";
  const system = isCxCeo
    ? EMAIL_B2B_CUSTOMER_SUPPORT_SYSTEM
    : EMAIL_HEAD_OF_GROWTH_SYSTEM;
  const promptBuilder = isCxCeo
    ? buildEmailB2bCustomerSupportPrompt
    : buildEmailHeadOfGrowthPrompt;

  const result = await runClaudeJson<{
    variants: DraftVariant[];
    recommended_variant: number;
  }>({
    system,
    prompt: promptBuilder({
      companyName,
      recipientName,
      recipientTitle,
      roleTitle,
      analysisContext,
      omarProfile: ctx.profile,
      outreachStyle: ctx.outreachStyle,
    }),
    maxTokens: 4096,
  });

  // Save all variants in parallel
  const insertResults = await Promise.all(
    result.variants.map((v, i) =>
      supabase
        .from("email_drafts")
        .insert({
          user_id: user.id,
          draft_type: draftType,
          company_name: companyName,
          recipient_name: recipientName,
          recipient_title: recipientTitle,
          context: { role_title: roleTitle, reasoning: v.reasoning },
          subject: v.subject,
          body: v.body,
          variant_index: i,
          status: "draft",
          source_analysis_id: analysisId,
        })
        .select("id")
        .single(),
    ),
  );

  const firstError = insertResults.find((r) => r.error);
  if (firstError?.error) return { error: firstError.error.message };

  const draftIds = insertResults.filter((r) => r.data).map((r) => r.data!.id);

  return { draftIds, recommendedVariant: result.recommended_variant };
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
