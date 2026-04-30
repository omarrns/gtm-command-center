/**
 * Pipeline Step: Draft
 *
 * Generates one cold email via Claude using the Inkeep-insider prompt,
 * creates the email_drafts row, and advances opportunity to 'drafted' then 'queued'.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRow } from "@/lib/supabase/types";
import { MODELS, runClaudeJson } from "@/lib/ai/anthropic";
import {
  buildEmailB2bCustomerSupportSystem,
  buildEmailB2bCustomerSupportPrompt,
} from "@/lib/skills/prompts/email-b2b-customer-support";
import { loadMemoryContext, formatMemoryForPrompt } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import {
  claimOpportunity,
  releaseOpportunity,
  advanceStage,
  getOpportunitiesByStage,
} from "@/lib/pipeline/opportunities";

const MAX_DRAFTS_PER_RUN = 5;

export interface DraftResult {
  processed: number;
  drafted: number;
  errors: number;
}

export async function runDraft(
  svc: SupabaseClient,
  userId: string,
  runId?: string,
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
      await processOneDraft(svc, userId, opp, runId);
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

interface DraftOutput {
  subject: string;
  body: string;
  reasoning: string;
}

async function processOneDraft(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
  runId?: string,
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

  // Append privacy guard to the system prompt — drafts must not include raw
  // memory content (positioning docs, dealbreakers, internal strategy notes).
  const PRIVACY_GUARD = `

PRIVACY CONSTRAINT: The profile and style context below is for YOUR reference only.
Do NOT quote, paraphrase, or include raw memory content in the email body.
The email should sound like the sender wrote it naturally — not like it was generated from a document.
Never mention internal scoring, dealbreakers, or strategy notes.`;

  const system = buildEmailB2bCustomerSupportSystem(sender) + PRIVACY_GUARD;

  const prompt = buildEmailB2bCustomerSupportPrompt({
    companyName: opp.company_name,
    recipientName: opp.recipient_name ?? "Hiring Manager",
    recipientTitle: opp.recipient_title ?? "Unknown",
    roleTitle: opp.role_title ?? undefined,
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
  });

  const draftOutput = await runClaudeJson<DraftOutput>({
    system,
    prompt,
    model: MODELS.sonnet,
    maxTokens: 4096,
    scope: {
      runId,
      userId,
      scopeTable: "opportunities",
      scopeId: opp.id,
      callPurpose: "draft",
    },
  });

  if (!draftOutput.subject || !draftOutput.body) {
    throw new Error(
      `Draft output missing subject or body for opportunity ${opp.id}`,
    );
  }

  const { data: draft, error: draftError } = await svc
    .from("email_drafts")
    .insert({
      user_id: userId,
      opportunity_id: opp.id,
      draft_type: "email-b2b-customer-support",
      company_name: opp.company_name,
      recipient_name: opp.recipient_name,
      recipient_title: opp.recipient_title,
      context: { reasoning: draftOutput.reasoning },
      subject: draftOutput.subject,
      body: draftOutput.body,
      variant_index: 0,
      status: "draft",
    })
    .select("id")
    .single();

  if (draftError) throw draftError;

  // Advance: enriched -> drafted -> queued
  const drafted = await advanceStage(
    svc,
    opp.id,
    userId,
    "enriched",
    "drafted",
    {
      selected_draft_id: draft.id,
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
