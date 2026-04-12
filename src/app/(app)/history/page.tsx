import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getOpportunitiesHistory } from "@/lib/pipeline/opportunities";
import type { OpportunityStage } from "@/lib/supabase/types";
import { HistoryClient } from "./history-client";

// Pipeline-internal stages the user never directly acted on — hide from History
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
  groupByDate,
} from "../_loaders/today-queue";

export default async function HistoryPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const [opportunities, pipelineConfig] = await Promise.all([
    getOpportunitiesHistory(svc, user.id, {
      stages: HISTORY_STAGES,
      limit: 50,
      offset: 0,
    }),
    svc
      .from("pipeline_config")
      .select("score_threshold")
      .eq("user_id", user.id)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  const scoreThreshold = pipelineConfig?.score_threshold ?? 70;

  const oppIds = opportunities.map((o) => o.id);
  const analysisIds = opportunities
    .map((o) => o.analysis_id)
    .filter((id): id is string => id != null);
  const researchIds = opportunities
    .map((o) => o.research_id)
    .filter((id): id is string => id != null);

  const [draftsMap, analysisSummaries, researchSummaries] = await Promise.all([
    loadDraftsMap(svc, user.id, oppIds),
    loadAnalysisSummaries(svc, analysisIds),
    loadResearchSummaries(svc, researchIds),
  ]);

  return (
    <HistoryClient
      initialGrouped={groupByDate(opportunities)}
      initialDraftsMap={draftsMap}
      initialAnalysisSummaries={analysisSummaries}
      initialResearchSummaries={researchSummaries}
      scoreThreshold={scoreThreshold}
    />
  );
}
