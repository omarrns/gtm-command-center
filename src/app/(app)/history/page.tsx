import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getOpportunitiesHistory } from "@/lib/pipeline/opportunities";
import { HistoryClient } from "./history-client";
import {
  loadDraftsMap,
  loadAnalysisSummaries,
  loadResearchSummaries,
  groupByDate,
} from "../_loaders/today-queue";

export default async function HistoryPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const opportunities = await getOpportunitiesHistory(svc, user.id, {
    limit: 50,
    offset: 0,
  });

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
    />
  );
}
