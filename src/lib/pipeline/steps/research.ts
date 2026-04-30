/**
 * Pipeline Step: Research
 *
 * Uses Exa Websets people search to find CEO/hiring manager for scored opportunities.
 * Stores recipient info + webset_item_id for the enrichment step.
 * Advances to 'researched' or 'needs_contact' (if no contacts found).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRow } from "@/lib/supabase/types";
import { researchPeople } from "@/lib/pipeline/people-search";
import {
  claimOpportunity,
  releaseOpportunity,
  advanceStage,
  getOpportunitiesByStage,
} from "@/lib/pipeline/opportunities";

const MAX_RESEARCH_PER_RUN = 3;

export interface ResearchResult {
  processed: number;
  researched: number;
  needsContact: number;
  errors: number;
}

export async function runResearch(
  svc: SupabaseClient,
  userId: string,
  runId?: string,
): Promise<ResearchResult> {
  const opportunities = await getOpportunitiesByStage(
    svc,
    userId,
    "scored",
    MAX_RESEARCH_PER_RUN,
  );

  const result: ResearchResult = {
    processed: 0,
    researched: 0,
    needsContact: 0,
    errors: 0,
  };

  for (const opp of opportunities) {
    try {
      const claimed = await claimOpportunity(svc, opp.id, userId);
      if (!claimed) continue;

      result.processed++;
      await processOneResearch(svc, userId, opp, runId);

      const { data: updated } = await svc
        .from("opportunities")
        .select("stage")
        .eq("id", opp.id)
        .single();

      if (updated?.stage === "researched") result.researched++;
      else if (updated?.stage === "needs_contact") result.needsContact++;

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

async function processOneResearch(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
  runId?: string,
): Promise<void> {
  const research = await researchPeople(
    opp.company_name,
    opp.role_title ?? "",
    userId,
    svc,
    {
      scope: {
        userId,
        runId,
        scopeTable: "opportunities",
        scopeId: opp.id,
        callPurpose: "people_research",
      },
    },
  );

  // Create research_reports row
  const { data: report, error: reportError } = await svc
    .from("research_reports")
    .insert({
      user_id: userId,
      company_name: opp.company_name,
      role_title: opp.role_title,
      research_type: "people-research",
      status: "complete",
      input: {
        company_name: opp.company_name,
        role_title: opp.role_title,
        source: "pipeline",
      },
      result: research.researchResult,
    })
    .select("id")
    .single();

  if (reportError) throw reportError;

  // Require both a contact identity AND an enrichable webset item/ID.
  // Without the webset item, enrichment cannot discover their email.
  const isEnrichable =
    !!research.recipientName &&
    !!research.recipientWebsetId &&
    !!research.recipientWebsetItemId;

  const newStage = isEnrichable ? "researched" : "needs_contact";
  const advanced = await advanceStage(svc, opp.id, userId, "scored", newStage, {
    research_id: report.id,
    recipient_name: research.recipientName,
    recipient_title: research.recipientTitle,
    ...(isEnrichable
      ? {
          recipient_webset_id: research.recipientWebsetId,
          recipient_webset_item_id: research.recipientWebsetItemId,
        }
      : {}),
  });

  if (!advanced) {
    throw new Error(
      `Stage precondition missed: expected 'scored' for opportunity ${opp.id}`,
    );
  }
}
