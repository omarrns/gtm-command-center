import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getOpportunitiesByDate } from "@/lib/pipeline/opportunities";
import type {
  OpportunityRow,
  OpportunityStage,
  EmailDraftRow,
} from "@/lib/supabase/types";
import { TodayClient } from "./_components/today-client";

// Group order for displaying pipeline cards
const STAGE_ORDER: OpportunityStage[] = [
  "queued",
  "drafted",
  "enriched",
  "researched",
  "needs_contact",
  "scored",
  "discovered",
  "sending",
  "sent",
  "replied",
  "skipped",
  "filtered",
];

export default async function TodayPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const today = new Date().toISOString().slice(0, 10);
  const opportunities = await getOpportunitiesByDate(svc, user.id, today);

  // Fetch drafts for all opportunities that have them
  const oppIds = opportunities.map((o) => o.id);
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

  // Fetch analysis summaries for opportunities with analysis_id
  const analysisIds = opportunities
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

  // Fetch research summaries for opportunities with research_id
  const researchIds = opportunities
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

  // Build summary stats
  const found = opportunities.length;
  const scoredHigh = opportunities.filter(
    (o) => o.score != null && o.score >= 70,
  ).length;
  const queued = opportunities.filter((o) => o.stage === "queued").length;
  const sent = opportunities.filter(
    (o) => o.stage === "sent" || o.stage === "replied",
  ).length;

  // Sort opportunities by stage order
  const sorted = [...opportunities].sort((a, b) => {
    const aIdx = STAGE_ORDER.indexOf(a.stage as OpportunityStage);
    const bIdx = STAGE_ORDER.indexOf(b.stage as OpportunityStage);
    return aIdx - bIdx;
  });

  // Group by stage
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
      stats={{ found, scoredHigh, queued, sent }}
    />
  );
}
