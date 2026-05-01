import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftResult } from "@/lib/pipeline/steps/draft";
import type { OpportunityRow } from "@/lib/supabase/types";
import { MODELS, runClaudeJson } from "@/lib/ai/anthropic";
import { createLogger } from "@/lib/logger";
import { safeParseIcpRubric } from "@/lib/onboarding/icp-schemas";
import {
  advanceStage,
  claimOpportunity,
  releaseOpportunity,
} from "@/lib/pipeline/opportunities";
import { formatMemoryForPrompt, loadMemoryContext } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import {
  buildIcpAccountOutreachPrompt,
  buildIcpAccountOutreachSystem,
  icpAccountDraftOutputSchema,
} from "@/lib/skills/prompts/icp-account-outreach";

const MAX_DRAFTS_PER_RUN = 5;
const MISSING_ARC_ERROR =
  "Narrative arc not yet generated - finish onboarding to generate icp_narrative_arc memory doc.";

export const GTM_DRAFT_PRIVACY_GUARD = `

PRIVACY CONSTRAINT: The profile and style context below is for YOUR reference only.
Do NOT quote, paraphrase, or include raw memory content in the email body.
The email should sound like the sender wrote it naturally — not like it was generated from a document.
Never mention internal scoring, dealbreakers, or strategy notes.`;

type DraftSkipReason =
  | "already_drafted"
  | "not_found"
  | "wrong_stage"
  | "missing_arc"
  | "missing_rubric"
  | "invalid_persona";

export interface DraftAccountResult {
  skipped?: DraftSkipReason;
  drafted?: { id: string; subject: string };
  error?: string;
}

interface BuyerPersona {
  name: string;
  title: string;
  description: string;
  email: string | null;
}

interface DraftOpportunityShape {
  recipient_email: string | null;
  recipient_name: string | null;
  recipient_title: string | null;
}

/**
 * Buyer persona precedence: exact email match, exact name match, first
 * persona, then recipient-column fallback until enrichment writes a stable
 * buyer_personas schema.
 */
export function pickPrimaryBuyerPersona(
  personas: Record<string, unknown>[] | null,
  opp: DraftOpportunityShape,
): BuyerPersona | null {
  const parsed = (personas ?? []).map(readPersona).filter(isPersona);
  const emailMatch = parsed.find(
    (persona) => persona.email && persona.email === opp.recipient_email,
  );
  if (emailMatch) return emailMatch;

  const nameMatch = parsed.find(
    (persona) => persona.name && persona.name === opp.recipient_name,
  );
  if (nameMatch) return nameMatch;

  if (parsed[0]) return parsed[0];

  if (!opp.recipient_name && !opp.recipient_title) return null;
  return {
    name: opp.recipient_name ?? "(target buyer)",
    title: opp.recipient_title ?? "",
    description: "",
    email: opp.recipient_email,
  };
}

export async function draftOneGtmAccount(
  svc: SupabaseClient,
  userId: string,
  opportunityId: string,
  runId?: string,
): Promise<DraftAccountResult> {
  const log = createLogger({
    runId,
    userId,
    opportunityId,
    scope: "draft-gtm",
  });

  const { data: oppRaw, error: oppError } = await svc
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (oppError) throw oppError;

  const opp = oppRaw as OpportunityRow | null;
  if (!opp) return { skipped: "not_found" };

  const existingDraft = await findExistingDraft(svc, userId, opp.id);
  if (existingDraft) {
    if (opp.selected_draft_id !== existingDraft.id) {
      const { error: updateError } = await svc
        .from("opportunities")
        .update({ selected_draft_id: existingDraft.id })
        .eq("id", opp.id)
        .eq("user_id", userId);
      if (updateError) throw updateError;
    }
    return { skipped: "already_drafted" };
  }

  if (opp.stage !== "enriched") return { skipped: "wrong_stage" };

  const memoryCtx = await loadMemoryContext(userId, svc);
  const narrativeArcMarkdown = formatMemoryForPrompt(memoryCtx, [
    "icp_narrative_arc",
  ]);
  if (!narrativeArcMarkdown.trim()) {
    log.warn("missing icp narrative arc; skipping draft");
    await writeLastError(svc, userId, opp.id, MISSING_ARC_ERROR);
    return { skipped: "missing_arc" };
  }

  const rubricBuyer = await loadRubricBuyer(svc, userId);
  if (!rubricBuyer) {
    await writeLastError(svc, userId, opp.id, "ICP rubric buyer is missing.");
    return { skipped: "missing_rubric" };
  }

  const persona = pickPrimaryBuyerPersona(opp.buyer_personas, opp);
  if (!persona) {
    await writeLastError(svc, userId, opp.id, "Buyer persona is missing.");
    return { skipped: "invalid_persona" };
  }

  const recentResearch = await loadRecentResearch(svc, userId, opp);
  const sender = extractSenderIdentity(memoryCtx, memoryCtx.displayName);
  const system =
    buildIcpAccountOutreachSystem(sender) + GTM_DRAFT_PRIVACY_GUARD;
  const prompt = buildIcpAccountOutreachPrompt({
    companyName: opp.company_name,
    companyDomain: opp.company_domain,
    persona,
    narrativeArcMarkdown,
    rubricBuyer,
    senderProfile: formatMemoryForPrompt(memoryCtx, [
      "user_profile",
      "user_omar_profile",
      "user_positioning",
    ]),
    outreachStyle: formatMemoryForPrompt(memoryCtx, [
      "feedback_outreach_style",
      "feedback_outreach_performance",
    ]),
    accountSignals: opp.trigger_signals?.[0] ?? null,
    recentResearch,
  });

  const rawOutput = await runClaudeJson<unknown>({
    system,
    prompt,
    model: MODELS.sonnet,
    maxTokens: 4096,
    scope: {
      runId,
      userId,
      scopeTable: "opportunities",
      scopeId: opp.id,
      callPurpose: "icp-account-outreach",
    },
  });
  const parsed = icpAccountDraftOutputSchema.safeParse(rawOutput);
  if (!parsed.success) {
    const message = `ICP account draft output failed schema validation: ${parsed.error.message}`;
    await writeLastError(svc, userId, opp.id, message);
    return { error: message };
  }

  const inserted = await insertDraft(svc, userId, opp, persona, parsed.data);
  if ("skipped" in inserted) return inserted;

  const advanced = await advanceStage(svc, opp.id, userId, "enriched", "drafted", {
    selected_draft_id: inserted.drafted.id,
    last_error: null,
  });
  if (!advanced) {
    throw new Error(
      `Stage precondition missed: expected 'enriched' for opportunity ${opp.id}`,
    );
  }

  return inserted;
}

export async function runDraftGtm(
  svc: SupabaseClient,
  userId: string,
  runId?: string,
): Promise<DraftResult> {
  const { data, error } = await svc
    .from("opportunities")
    .select("*")
    .eq("user_id", userId)
    .eq("stage", "enriched")
    .in("source", ["theirstack", "exa-dormant"])
    .order("score", { ascending: false, nullsFirst: false })
    .limit(MAX_DRAFTS_PER_RUN);
  if (error) throw error;

  const opportunities = (data ?? []) as OpportunityRow[];
  const result: DraftResult = { processed: 0, drafted: 0, errors: 0 };
  const log = createLogger({ runId, userId, scope: "draft-gtm.batch" });

  for (const opp of opportunities) {
    const claimed = await claimOpportunity(svc, opp.id, userId);
    if (!claimed) continue;

    result.processed++;
    try {
      const outcome = await draftOneGtmAccount(svc, userId, opp.id, runId);
      if (outcome.drafted) result.drafted++;
      if (outcome.error) result.errors++;
    } catch (err) {
      result.errors++;
      log.error("gtm draft failed", err, { opportunityId: opp.id });
      await writeLastError(
        svc,
        userId,
        opp.id,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      await releaseOpportunity(svc, opp.id, userId);
    }
  }

  return result;
}

function readPersona(persona: Record<string, unknown>): BuyerPersona {
  return {
    name: stringField(persona, "name"),
    title: stringField(persona, "title"),
    description: stringField(persona, "description"),
    email: stringField(persona, "email") || null,
  };
}

function isPersona(persona: BuyerPersona): boolean {
  return !!(persona.name || persona.title || persona.description || persona.email);
}

function stringField(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === "string" ? value.trim() : "";
}

async function loadRubricBuyer(
  svc: SupabaseClient,
  userId: string,
): Promise<unknown | null> {
  const { data, error } = await svc
    .from("user_scoring_profiles")
    .select("icp_rubric")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const parsed = safeParseIcpRubric(data?.icp_rubric ?? {});
  if (!parsed.success) return null;
  return parsed.data.buyer;
}

async function loadRecentResearch(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
): Promise<string | undefined> {
  if (!opp.research_id) return undefined;
  const { data, error } = await svc
    .from("research_reports")
    .select("result")
    .eq("id", opp.research_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.result) return undefined;
  return JSON.stringify(data.result, null, 2).slice(0, 3000);
}

async function findExistingDraft(
  svc: SupabaseClient,
  userId: string,
  opportunityId: string,
): Promise<{ id: string; subject: string | null } | null> {
  const { data, error } = await svc
    .from("email_drafts")
    .select("id, subject")
    .eq("user_id", userId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; subject: string | null } | null;
}

async function insertDraft(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
  persona: BuyerPersona,
  output: { subject: string; body: string; reasoning: string },
): Promise<Required<Pick<DraftAccountResult, "drafted">> | { skipped: "already_drafted" }> {
  const { data, error } = await svc
    .from("email_drafts")
    .insert({
      user_id: userId,
      opportunity_id: opp.id,
      draft_type: "icp-account-outreach",
      company_name: opp.company_name,
      recipient_name: persona.name,
      recipient_title: persona.title,
      context: {
        reasoning: output.reasoning,
        buyer_persona: persona,
        account_signal: opp.trigger_signals?.[0] ?? null,
      },
      subject: output.subject,
      body: output.body,
      variant_index: 0,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    if (isUniqueDraftError(error)) {
      const existing = await findExistingDraft(svc, userId, opp.id);
      if (existing) {
        const { error: updateError } = await svc
          .from("opportunities")
          .update({ selected_draft_id: existing.id })
          .eq("id", opp.id)
          .eq("user_id", userId);
        if (updateError) throw updateError;
      }
      return { skipped: "already_drafted" };
    }
    throw error;
  }

  return { drafted: { id: data.id as string, subject: output.subject } };
}

function isUniqueDraftError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" ||
    (error.message?.includes("email_drafts_one_per_opportunity") ?? false)
  );
}

async function writeLastError(
  svc: SupabaseClient,
  userId: string,
  opportunityId: string,
  message: string,
): Promise<void> {
  const { error } = await svc
    .from("opportunities")
    .update({ last_error: message })
    .eq("id", opportunityId)
    .eq("user_id", userId);
  if (error) throw error;
}
