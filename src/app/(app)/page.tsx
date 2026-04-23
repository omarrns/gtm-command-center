import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isOnboardingComplete } from "@/lib/pipeline/onboarding";
import { getOpportunitiesByStages } from "@/lib/pipeline/opportunities";
import type {
  OpportunityRow,
  OpportunityStage,
  UserType,
} from "@/lib/supabase/types";
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

  // GTM users always redirect to /icp (their onboarding + dashboard hub).
  // Load user_type first so the onboarding redirect and persona branch
  // both use the same value.
  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();
  const userType = (profile?.user_type as UserType | null) ?? null;

  // Onboarding gate
  const skipOnboarding =
    process.env.DEV_SKIP_ONBOARDING === "true" &&
    process.env.NODE_ENV === "development";

  if (!skipOnboarding) {
    const onboarding = await isOnboardingComplete(
      svc,
      user.id,
      userType ?? "job_seeker",
    );
    if (!onboarding.complete) {
      redirect(userType === "gtm" ? "/icp" : "/onboard");
    }
  }

  // GTM users live at /icp — both onboarding and post-onboarding dashboard.
  if (userType === "gtm") {
    redirect("/icp");
  }

  const { data: pipelineConfig } = await svc
    .from("pipeline_config")
    .select("activation_completed_at, score_threshold")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!skipOnboarding) {
    if (pipelineConfig && !pipelineConfig.activation_completed_at) {
      redirect("/activate");
    }
  }

  const scoreThreshold = pipelineConfig?.score_threshold ?? 70;

  // today still used for loadDashboardMetrics (sent-today, weekly, funnel date windows)
  const today = new Date().toISOString().slice(0, 10);
  // List shows actionable stages regardless of discovery date — a row queued
  // today but discovered last week still belongs on Today. Previously this
  // filtered by discovered_at = today, which hid legitimate queued work.
  const opportunities = await getOpportunitiesByStages(
    svc,
    user.id,
    Array.from(TODAY_STAGES),
  );

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
      scoreThreshold={scoreThreshold}
    />
  );
}
