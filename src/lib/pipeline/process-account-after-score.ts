import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRow, PipelineConfigRow } from "@/lib/supabase/types";
import {
  claimOpportunity,
  releaseOpportunity,
} from "@/lib/pipeline/opportunities";
import { researchOneGtmAccount } from "@/lib/pipeline/steps/research-account";
import { discoverContactsForAccount } from "@/lib/pipeline/steps/discover-contacts-account";
import { enrichContactsForAccount } from "@/lib/pipeline/steps/enrich-contacts-account";
import {
  draftOneGtmAccount,
  type DraftAccountResult,
} from "@/lib/pipeline/steps/draft-gtm";
import { createLogger } from "@/lib/logger";

export interface ProcessAccountAfterScoreOptions {
  skipThreshold?: boolean;
  runId?: string;
}

export async function processAccountAfterScore(
  svc: SupabaseClient,
  userId: string,
  opportunityId: string,
  options: ProcessAccountAfterScoreOptions = {},
): Promise<Record<string, unknown>> {
  const { data: oppRaw, error } = await svc
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const opp = oppRaw as OpportunityRow | null;
  if (!opp) return { skipped: "not_found" };

  if (!options.skipThreshold) {
    const threshold = await loadThreshold(svc, userId);
    if ((opp.score ?? 0) < threshold) {
      return { skipped: "below_threshold", threshold, score: opp.score };
    }
  }

  const claimed = await claimOpportunity(svc, opportunityId, userId);
  if (!claimed) return { skipped: "claimed" };

  try {
    await prepareManualRetryIfNeeded(svc, userId, opp, !!options.skipThreshold);
    const research = await researchOneGtmAccount(
      svc,
      userId,
      opportunityId,
      options.runId,
    );
    const contacts = await discoverContactsForAccount(svc, userId, opportunityId);
    const enrich = await enrichContactsForAccount(svc, userId, opportunityId);
    const draft = await tryDraftAccount(svc, userId, opportunityId, options.runId);
    return { research, contacts, enrich, draft };
  } finally {
    await releaseOpportunity(svc, opportunityId, userId);
  }
}

async function tryDraftAccount(
  svc: SupabaseClient,
  userId: string,
  opportunityId: string,
  runId?: string,
): Promise<DraftAccountResult | { error: string }> {
  try {
    return await draftOneGtmAccount(svc, userId, opportunityId, runId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    createLogger({
      runId,
      userId,
      opportunityId,
      scope: "process-account-after-score",
    }).error("draft tail failed", err);
    const { error: updateError } = await svc
      .from("opportunities")
      .update({ last_error: message })
      .eq("id", opportunityId)
      .eq("user_id", userId);
    if (updateError) {
      createLogger({
        runId,
        userId,
        opportunityId,
        scope: "process-account-after-score",
      }).error("failed to persist draft error", updateError);
    }
    return { error: message };
  }
}

async function loadThreshold(
  svc: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await svc
    .from("pipeline_config")
    .select("score_threshold")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Pick<PipelineConfigRow, "score_threshold"> | null)
    ?.score_threshold ?? 70;
}

async function prepareManualRetryIfNeeded(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
  skipThreshold: boolean,
): Promise<void> {
  if (!skipThreshold) return;

  if (opp.stage === "filtered") {
    const { error } = await svc
      .from("opportunities")
      .update({ stage: "scored", last_error: null })
      .eq("id", opp.id)
      .eq("user_id", userId)
      .eq("stage", "filtered");
    if (error) throw error;
    return;
  }

  if (opp.stage === "needs_contact") {
    const { error } = await svc
      .from("opportunities")
      .update({
        stage: "researched",
        enrichment_attempts: 0,
        alt_enrichment_attempts: 0,
        last_error: null,
      })
      .eq("id", opp.id)
      .eq("user_id", userId)
      .eq("stage", "needs_contact");
    if (error) throw error;
  }
}
