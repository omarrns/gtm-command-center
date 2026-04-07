"use server";

import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getOpportunitiesHistory } from "@/lib/pipeline/opportunities";
import type {
  OpportunityRow,
  OpportunityStage,
  EmailDraftRow,
} from "@/lib/supabase/types";

export interface HistoryFilters {
  stage?: OpportunityStage;
  minScore?: number;
  maxScore?: number;
  company?: string;
  limit?: number;
  offset?: number;
}

export interface HistoryResult {
  ok: boolean;
  data: OpportunityRow[];
  draftsMap: Record<string, EmailDraftRow[]>;
  analysisSummaries: Record<string, string>;
  researchSummaries: Record<string, string>;
  error?: string;
}

/**
 * Fetch history with filters, including related drafts and summaries.
 * Returns everything the client needs to render opportunity cards.
 */
export async function getHistoryAction(
  filters: HistoryFilters = {},
): Promise<HistoryResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const empty: HistoryResult = {
    ok: false,
    data: [],
    draftsMap: {},
    analysisSummaries: {},
    researchSummaries: {},
  };

  try {
    const data = await getOpportunitiesHistory(svc, user.id, {
      stage: filters.stage,
      minScore: filters.minScore,
      maxScore: filters.maxScore,
      company: filters.company,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    });

    // Fetch drafts
    const oppIds = data.map((o) => o.id);
    const draftsMap: Record<string, EmailDraftRow[]> = {};

    if (oppIds.length > 0) {
      const { data: allDrafts } = await svc
        .from("email_drafts")
        .select("*")
        .in("opportunity_id", oppIds)
        .eq("user_id", user.id)
        .order("variant_index", { ascending: true });

      if (allDrafts) {
        for (const draft of allDrafts as EmailDraftRow[]) {
          const oppId = draft.opportunity_id;
          if (oppId) {
            if (!draftsMap[oppId]) draftsMap[oppId] = [];
            draftsMap[oppId].push(draft);
          }
        }
      }
    }

    // Fetch analysis summaries
    const analysisIds = data
      .map((o) => o.analysis_id)
      .filter((id): id is string => id != null);
    const analysisSummaries: Record<string, string> = {};

    if (analysisIds.length > 0) {
      const { data: analyses } = await svc
        .from("analyses")
        .select("id, result")
        .in("id", analysisIds);

      if (analyses) {
        for (const a of analyses) {
          const result = a.result as Record<string, unknown> | null;
          const summary =
            (result?.summary as string) ??
            (result?.executive_summary as string) ??
            "";
          if (summary) analysisSummaries[a.id] = summary;
        }
      }
    }

    // Fetch research summaries
    const researchIds = data
      .map((o) => o.research_id)
      .filter((id): id is string => id != null);
    const researchSummaries: Record<string, string> = {};

    if (researchIds.length > 0) {
      const { data: reports } = await svc
        .from("research_reports")
        .select("id, result")
        .in("id", researchIds);

      if (reports) {
        for (const r of reports) {
          const result = r.result as Record<string, unknown> | null;
          const summary =
            (result?.summary as string) ??
            (result?.executive_summary as string) ??
            "";
          if (summary) researchSummaries[r.id] = summary;
        }
      }
    }

    return { ok: true, data, draftsMap, analysisSummaries, researchSummaries };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ...empty, error: message };
  }
}
