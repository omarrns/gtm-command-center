/**
 * Pipeline Step: Draft
 *
 * Auto-routes email template by recipient title, generates 2 variants via Claude,
 * creates email_drafts rows, and advances opportunity to 'drafted' then 'queued'.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRow } from "@/lib/supabase/types";
import { runClaudeJson } from "@/lib/ai/anthropic";
import {
  buildEmailB2bCustomerSupportSystem,
  buildEmailB2bCustomerSupportPrompt,
} from "@/lib/skills/prompts/email-b2b-customer-support";
import {
  buildEmailHeadOfGrowthSystem,
  buildEmailHeadOfGrowthPrompt,
} from "@/lib/skills/prompts/email-head-of-growth";
import { loadMemoryContext, formatMemoryForPrompt } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import {
  claimOpportunity,
  releaseOpportunity,
  advanceStage,
  getOpportunitiesByStage,
} from "@/lib/pipeline/opportunities";

const MAX_DRAFTS_PER_RUN = 5;

// CEO/founder keywords route to the b2b-customer-support prompt
const CEO_KEYWORDS = ["ceo", "founder", "cto", "co-founder", "cofounder"];

export interface DraftResult {
  processed: number;
  drafted: number;
  errors: number;
}

export async function runDraft(
  svc: SupabaseClient,
  userId: string,
): Promise<DraftResult> {
  const opportunities = await getOpportunitiesByStage(
    svc,
    userId,
    "enriched",
    MAX_DRAFTS_PER_RUN,
  );

  const result: DraftResult = { processed: 0, drafted: 0, errors: 0 };

  for (const opp of opportunities) {
    try {
      const claimed = await claimOpportunity(svc, opp.id, userId);
      if (!claimed) continue;

      result.processed++;
      await processOneDraft(svc, userId, opp);
      result.drafted++;

      await releaseOpportunity(svc, opp.id, userId);
    } catch (err) {
      result.errors++;
      await svc
        .from("opportunities")
        .update({
          last_error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", opp.id)
        .eq("user_id", userId);
      await releaseOpportunity(svc, opp.id, userId);
    }
  }

  return result;
}

interface DraftVariant {
  variant_name: string;
  subject: string;
  body: string;
  reasoning: string;
}

interface DraftOutput {
  variants: DraftVariant[];
  recommended_variant: number;
}

async function processOneDraft(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
): Promise<void> {
  const memoryCtx = await loadMemoryContext(userId, svc);
  const sender = extractSenderIdentity(memoryCtx, memoryCtx.displayName);

  // Build analysis context from linked analysis if available
  let analysisContext: string | undefined;
  if (opp.analysis_id) {
    const { data: analysis } = await svc
      .from("analyses")
      .select("result")
      .eq("id", opp.analysis_id)
      .single();

    if (analysis?.result) {
      analysisContext = JSON.stringify(analysis.result).slice(0, 2000);
    }
  }

  const isCeoType = CEO_KEYWORDS.some((kw) =>
    (opp.recipient_title ?? "").toLowerCase().includes(kw),
  );

  // Append privacy guard to the system prompt — drafts must not include raw
  // memory content (positioning docs, dealbreakers, internal strategy notes).
  const PRIVACY_GUARD = `

PRIVACY CONSTRAINT: The profile and style context below is for YOUR reference only.
Do NOT quote, paraphrase, or include raw memory content in the email body.
The email should sound like the sender wrote it naturally — not like it was generated from a document.
Never mention internal scoring, dealbreakers, or strategy notes.`;

  const baseSystem = isCeoType
    ? buildEmailB2bCustomerSupportSystem(sender)
    : buildEmailHeadOfGrowthSystem(sender);

  const system = baseSystem + PRIVACY_GUARD;

  const promptArgs = {
    companyName: opp.company_name,
    recipientName: opp.recipient_name ?? "Hiring Manager",
    recipientTitle: opp.recipient_title ?? "Unknown",
    roleTitle: opp.role_title,
    analysisContext,
    senderProfile: formatMemoryForPrompt(memoryCtx, [
      "user_profile",
      "user_omar_profile",
      "user_positioning",
    ]),
    outreachStyle: formatMemoryForPrompt(memoryCtx, [
      "feedback_outreach_style",
      "feedback_outreach_performance",
    ]),
  };

  const prompt = isCeoType
    ? buildEmailB2bCustomerSupportPrompt(promptArgs)
    : buildEmailHeadOfGrowthPrompt(promptArgs);

  const draftOutput = await runClaudeJson<DraftOutput>({
    system,
    prompt,
    maxTokens: 4096,
  });

  // Validate exactly 2 usable variants with required fields.
  // Reject any other count — malformed output should not silently proceed.
  if (
    !Array.isArray(draftOutput.variants) ||
    draftOutput.variants.length !== 2
  ) {
    throw new Error(
      `Draft output has ${draftOutput.variants?.length ?? 0} variants, expected exactly 2 for opportunity ${opp.id}`,
    );
  }
  const variants = draftOutput.variants;
  for (const v of variants) {
    if (!v.subject || !v.body) {
      throw new Error(
        `Draft variant missing subject or body for opportunity ${opp.id}`,
      );
    }
  }

  // Insert email draft rows with opportunity_id
  const draftType = isCeoType
    ? "email-b2b-customer-support"
    : "email-head-of-growth";

  let firstDraftId: string | null = null;

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const { data: draft, error: draftError } = await svc
      .from("email_drafts")
      .insert({
        user_id: userId,
        opportunity_id: opp.id,
        draft_type: draftType,
        company_name: opp.company_name,
        recipient_name: opp.recipient_name,
        recipient_title: opp.recipient_title,
        context: {
          variant_name: variant.variant_name,
          reasoning: variant.reasoning,
        },
        subject: variant.subject,
        body: variant.body,
        variant_index: i,
        status: "draft",
      })
      .select("id")
      .single();

    if (draftError) throw draftError;
    if (i === draftOutput.recommended_variant) {
      firstDraftId = draft.id;
    }
    if (i === 0 && !firstDraftId) {
      firstDraftId = draft.id;
    }
  }

  if (!firstDraftId) {
    throw new Error(
      `No usable draft variant produced for opportunity ${opp.id}`,
    );
  }

  // Advance: enriched -> drafted -> queued
  const drafted = await advanceStage(
    svc,
    opp.id,
    userId,
    "enriched",
    "drafted",
    {
      selected_draft_id: firstDraftId,
    },
  );

  if (!drafted) {
    throw new Error(
      `Stage precondition missed: expected 'enriched' for opportunity ${opp.id}`,
    );
  }

  const queued = await advanceStage(
    svc,
    opp.id,
    userId,
    "drafted",
    "queued",
    {},
  );

  if (!queued) {
    throw new Error(
      `Stage precondition missed: expected 'drafted' for opportunity ${opp.id}`,
    );
  }
}
