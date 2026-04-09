/**
 * Shared data loaders: drafts, analysis summaries, research summaries,
 * and date grouping. Used by both Today and History surfaces.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailDraftRow, OpportunityRow } from "@/lib/supabase/types";

export async function loadDraftsMap(
  svc: SupabaseClient,
  userId: string,
  opportunityIds: string[],
): Promise<Record<string, EmailDraftRow[]>> {
  const draftsMap: Record<string, EmailDraftRow[]> = {};
  if (opportunityIds.length === 0) return draftsMap;

  const { data: allDrafts, error } = await svc
    .from("email_drafts")
    .select("*")
    .in("opportunity_id", opportunityIds)
    .eq("user_id", userId)
    .order("variant_index", { ascending: true });

  if (error) {
    throw new Error(`loadDraftsMap failed: ${error.message}`);
  }

  if (allDrafts) {
    for (const draft of allDrafts as EmailDraftRow[]) {
      const oppId = draft.opportunity_id;
      if (oppId) {
        if (!draftsMap[oppId]) draftsMap[oppId] = [];
        draftsMap[oppId].push(draft);
      }
    }
  }

  return draftsMap;
}

export async function loadAnalysisSummaries(
  svc: SupabaseClient,
  analysisIds: string[],
): Promise<Record<string, string>> {
  const summaries: Record<string, string> = {};
  if (analysisIds.length === 0) return summaries;

  const { data: analyses, error } = await svc
    .from("analyses")
    .select("id, result")
    .in("id", analysisIds);

  if (error) {
    throw new Error(`loadAnalysisSummaries failed: ${error.message}`);
  }

  if (analyses) {
    for (const a of analyses) {
      const result = a.result as Record<string, unknown> | null;
      const raw =
        (result?.bottom_line as string) ??
        (result?.summary as string) ??
        (result?.executive_summary as string) ??
        "";
      if (raw) {
        const sentences = raw.match(/[^.!?]+[.!?]+/g) ?? [raw];
        const twoSentences = sentences.slice(0, 2).join(" ").trim();
        summaries[a.id] =
          twoSentences.length > 280
            ? twoSentences.slice(0, 277) + "..."
            : twoSentences;
      }
    }
  }

  return summaries;
}

export async function loadResearchSummaries(
  svc: SupabaseClient,
  researchIds: string[],
): Promise<Record<string, string>> {
  const summaries: Record<string, string> = {};
  if (researchIds.length === 0) return summaries;

  const { data: reports, error } = await svc
    .from("research_reports")
    .select("id, result")
    .in("id", researchIds);

  if (error) {
    throw new Error(`loadResearchSummaries failed: ${error.message}`);
  }

  if (reports) {
    for (const r of reports) {
      const result = r.result as Record<string, unknown> | null;
      const summary =
        (result?.summary as string) ??
        (result?.executive_summary as string) ??
        "";
      if (summary) summaries[r.id] = summary;
    }
  }

  return summaries;
}

/** Group opportunities by discovered_at date string (YYYY-MM-DD), newest first. */
export function groupByDate(
  opportunities: OpportunityRow[],
): { date: string; items: OpportunityRow[] }[] {
  const map = new Map<string, OpportunityRow[]>();

  for (const opp of opportunities) {
    const date = opp.discovered_at.slice(0, 10);
    const existing = map.get(date);
    if (existing) {
      existing.push(opp);
    } else {
      map.set(date, [opp]);
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}
