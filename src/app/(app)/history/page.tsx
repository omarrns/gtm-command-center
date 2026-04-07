import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getOpportunitiesHistory } from "@/lib/pipeline/opportunities";
import type { OpportunityRow, EmailDraftRow } from "@/lib/supabase/types";
import { HistoryClient } from "./history-client";

export default async function HistoryPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Initial load: last 50 opportunities
  const opportunities = await getOpportunitiesHistory(svc, user.id, {
    limit: 50,
    offset: 0,
  });

  // Fetch drafts for all opportunities
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

  // Fetch analysis summaries
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

  // Fetch research summaries
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

  // Group opportunities by date
  const grouped = groupByDate(opportunities);

  return (
    <HistoryClient
      initialGrouped={grouped}
      initialDraftsMap={draftsMap}
      initialAnalysisSummaries={analysisSummaries}
      initialResearchSummaries={researchSummaries}
    />
  );
}

/** Group opportunities by discovered_at date string (YYYY-MM-DD). */
function groupByDate(
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
