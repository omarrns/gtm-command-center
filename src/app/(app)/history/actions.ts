"use server";

import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getOpportunitiesHistory } from "@/lib/pipeline/opportunities";
import type {
  OpportunityRow,
  OpportunityStage,
  EmailDraftRow,
} from "@/lib/supabase/types";

const HISTORY_STAGES: OpportunityStage[] = [
  "queued",
  "researched",
  "scored",
  "sent",
  "replied",
  "skipped",
];
import {
  loadDraftsMap,
  loadAnalysisSummaries,
  loadResearchSummaries,
} from "../_loaders/today-queue";

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
      stages: HISTORY_STAGES,
      stage: filters.stage,
      minScore: filters.minScore,
      maxScore: filters.maxScore,
      company: filters.company,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    });

    const oppIds = data.map((o) => o.id);
    const analysisIds = data
      .map((o) => o.analysis_id)
      .filter((id): id is string => id != null);
    const researchIds = data
      .map((o) => o.research_id)
      .filter((id): id is string => id != null);

    const [draftsMap, analysisSummaries, researchSummaries] = await Promise.all(
      [
        loadDraftsMap(svc, user.id, oppIds),
        loadAnalysisSummaries(svc, analysisIds),
        loadResearchSummaries(svc, researchIds),
      ],
    );

    return { ok: true, data, draftsMap, analysisSummaries, researchSummaries };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ...empty, error: message };
  }
}
