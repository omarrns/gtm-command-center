import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getOpportunitiesHistory } from "@/lib/pipeline/opportunities";
import type { OpportunityStage, UserType } from "@/lib/supabase/types";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
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

  // SPEC-3 Phase 6.c: GTM persona has no opportunities pipeline in v1
  // — surface the empty-state explanation instead of running the
  // job_search loaders against an empty dataset.
  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();
  const userType = (profile?.user_type as UserType | null) ?? null;

  if (userType === "gtm") {
    return (
      <>
        <PageHeader
          title="History"
          description="Pipeline history of every opportunity you've acted on."
        />
        <EmptyState
          message="Automated discovery is coming"
          hint="Your ICP rubric is the v1 asset — refresh it from the home screen."
        />
      </>
    );
  }

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
