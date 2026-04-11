import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isOnboardingComplete } from "@/lib/pipeline/onboarding";
import { getOpportunitiesByDate } from "@/lib/pipeline/opportunities";
import type { OpportunityRow, OpportunityStage } from "@/lib/supabase/types";
import { TodayClient } from "./_components/today-client";
import {
  loadDraftsMap,
  loadAnalysisSummaries,
  loadResearchSummaries,
} from "./_loaders/today-queue";
import { loadDashboardMetrics } from "./_loaders/today-metrics";

// Only show stages the user can act on — pipeline internals belong in History
const TODAY_STAGES = new Set<OpportunityStage>([
  "queued",
  "researched",
  "scored",
]);
const STAGE_ORDER: OpportunityStage[] = ["queued", "researched", "scored"];

export default async function TodayPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Onboarding gate
  const skipOnboarding =
    process.env.DEV_SKIP_ONBOARDING === "true" &&
    process.env.NODE_ENV === "development";
  if (!skipOnboarding) {
    const onboarding = await isOnboardingComplete(svc, user.id);
    if (!onboarding.complete) {
      redirect("/onboard");
    }

    // Activation gate
    const { data: activationConfig } = await svc
      .from("pipeline_config")
      .select("activation_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (activationConfig && !activationConfig.activation_completed_at) {
      redirect("/activate");
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const opportunities = (
    await getOpportunitiesByDate(svc, user.id, today)
  ).filter((o) => TODAY_STAGES.has(o.stage as OpportunityStage));

  const oppIds = opportunities.map((o) => o.id);
  const analysisIds = opportunities
    .map((o) => o.analysis_id)
    .filter((id): id is string => id != null);
  const researchIds = opportunities
    .map((o) => o.research_id)
    .filter((id): id is string => id != null);

  const [draftsMap, analysisSummaries, researchSummaries, metrics] =
    await Promise.all([
      loadDraftsMap(svc, user.id, oppIds),
      loadAnalysisSummaries(svc, analysisIds),
      loadResearchSummaries(svc, researchIds),
      loadDashboardMetrics(svc, user.id, today),
    ]);

  // Sort and group by stage
  const sorted = [...opportunities].sort((a, b) => {
    const aIdx = STAGE_ORDER.indexOf(a.stage as OpportunityStage);
    const bIdx = STAGE_ORDER.indexOf(b.stage as OpportunityStage);
    return aIdx - bIdx;
  });

  const grouped: { stage: OpportunityStage; items: OpportunityRow[] }[] = [];
  for (const opp of sorted) {
    const stage = opp.stage as OpportunityStage;
    const last = grouped[grouped.length - 1];
    if (last && last.stage === stage) {
      last.items.push(opp);
    } else {
      grouped.push({ stage, items: [opp] });
    }
  }

  return (
    <TodayClient
      grouped={grouped}
      draftsMap={draftsMap}
      analysisSummaries={analysisSummaries}
      researchSummaries={researchSummaries}
      metrics={metrics}
    />
  );
}
