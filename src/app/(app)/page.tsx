import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getOpportunitiesByDate } from "@/lib/pipeline/opportunities";
import type {
  OpportunityRow,
  OpportunityStage,
  EmailDraftRow,
} from "@/lib/supabase/types";
import { TodayClient, type DashboardMetrics } from "./_components/today-client";

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

// Stages shown in the pipeline funnel visualization
const FUNNEL_STAGES: OpportunityStage[] = [
  "discovered",
  "scored",
  "researched",
  "enriched",
  "drafted",
  "queued",
  "sent",
  "replied",
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

  // ── Dashboard metrics (all-time + today) ──
  // All metric queries are independent — run in parallel to avoid waterfall.

  const todayStart = `${today}T00:00:00.000Z`;
  const todayEnd = `${today}T23:59:59.999Z`;

  // Week bounds: Monday 00:00 UTC – next Monday 00:00 UTC (exclusive)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon…
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - mondayOffset);
  monday.setUTCHours(0, 0, 0, 0);
  const weekStart = monday.toISOString();
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  const weekEnd = nextMonday.toISOString();

  const [
    sentAndRepliedRes,
    repliedRes,
    sentTodayRes,
    configRes,
    sentWeekRes,
    avgScoreRes,
    funnelRes,
  ] = await Promise.all([
    svc
      .from("opportunities")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("stage", ["sent", "replied"]),
    svc
      .from("opportunities")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("stage", "replied"),
    svc
      .from("opportunities")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("stage", ["sent", "replied"])
      .gte("sent_at", todayStart)
      .lte("sent_at", todayEnd),
    svc
      .from("pipeline_config")
      .select("daily_send_cap")
      .eq("user_id", user.id)
      .single(),
    svc
      .from("opportunities")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("stage", ["sent", "replied"])
      .gte("sent_at", weekStart)
      .lt("sent_at", weekEnd),
    // Avg score — no raw SQL AVG in Supabase client, so fetch scores and compute in JS.
    // Only the score column is selected to minimize transfer.
    svc
      .from("opportunities")
      .select("score")
      .eq("user_id", user.id)
      .in("stage", ["sent", "replied"])
      .not("score", "is", null),
    // Funnel — no GROUP BY in Supabase client, so fetch stage column and count in JS.
    // Only the stage column is selected to minimize transfer.
    svc
      .from("opportunities")
      .select("stage")
      .eq("user_id", user.id)
      .in("stage", FUNNEL_STAGES),
  ]);

  // Reply rate
  const sentAndRepliedCount = sentAndRepliedRes.count ?? 0;
  const replyRate =
    sentAndRepliedCount > 0
      ? Math.round(((repliedRes.count ?? 0) / sentAndRepliedCount) * 100)
      : null;

  const dailyCap = configRes.data?.daily_send_cap ?? 10;

  // Avg score
  let avgScore: number | null = null;
  const avgScoreRows = avgScoreRes.data;
  if (avgScoreRows && avgScoreRows.length > 0) {
    const sum = avgScoreRows.reduce(
      (acc, r) => acc + ((r as { score: number }).score ?? 0),
      0,
    );
    avgScore = Math.round(sum / avgScoreRows.length);
  }

  // Funnel counts
  const funnelCounts: Record<string, number> = {};
  for (const row of funnelRes.data ?? []) {
    const stage = (row as { stage: string }).stage;
    funnelCounts[stage] = (funnelCounts[stage] ?? 0) + 1;
  }

  const funnel = FUNNEL_STAGES.map((stage) => ({
    stage,
    count: funnelCounts[stage] ?? 0,
  })).filter((s) => s.count > 0);

  const metrics: DashboardMetrics = {
    replyRate,
    sentToday: sentTodayRes.count ?? 0,
    dailyCap,
    sentThisWeek: sentWeekRes.count ?? 0,
    avgScore,
    funnel,
  };

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
      metrics={metrics}
    />
  );
}
