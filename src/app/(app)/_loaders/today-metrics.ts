/**
 * Dashboard metric queries for the Today page. Extracted from page.tsx
 * so metrics concerns do not interleave with queue/gating logic.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityStage } from "@/lib/supabase/types";
import type { DashboardMetrics } from "../_components/today-helpers";

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

export async function loadDashboardMetrics(
  svc: SupabaseClient,
  userId: string,
  today: string,
): Promise<DashboardMetrics> {
  const todayStart = `${today}T00:00:00.000Z`;
  const todayEnd = `${today}T23:59:59.999Z`;

  const now = new Date();
  const dayOfWeek = now.getUTCDay();
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
      .eq("user_id", userId)
      .in("stage", ["sent", "replied"]),
    svc
      .from("opportunities")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("stage", "replied"),
    svc
      .from("opportunities")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("stage", ["sent", "replied"])
      .gte("sent_at", todayStart)
      .lte("sent_at", todayEnd),
    svc
      .from("pipeline_config")
      .select("daily_send_cap")
      .eq("user_id", userId)
      .single(),
    svc
      .from("opportunities")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("stage", ["sent", "replied"])
      .gte("sent_at", weekStart)
      .lt("sent_at", weekEnd),
    svc
      .from("opportunities")
      .select("score")
      .eq("user_id", userId)
      .in("stage", ["sent", "replied"])
      .not("score", "is", null),
    svc
      .from("opportunities")
      .select("stage")
      .eq("user_id", userId)
      .in("stage", FUNNEL_STAGES),
  ]);

  // Propagate query errors instead of silently using defaults
  if (sentAndRepliedRes.error)
    throw new Error(`sentAndReplied: ${sentAndRepliedRes.error.message}`);
  if (repliedRes.error) throw new Error(`replied: ${repliedRes.error.message}`);
  if (sentTodayRes.error)
    throw new Error(`sentToday: ${sentTodayRes.error.message}`);
  if (configRes.error) throw new Error(`config: ${configRes.error.message}`);
  if (sentWeekRes.error)
    throw new Error(`sentWeek: ${sentWeekRes.error.message}`);
  if (avgScoreRes.error)
    throw new Error(`avgScore: ${avgScoreRes.error.message}`);
  if (funnelRes.error) throw new Error(`funnel: ${funnelRes.error.message}`);

  const sentAndRepliedCount = sentAndRepliedRes.count ?? 0;
  const replyRate =
    sentAndRepliedCount > 0
      ? Math.round(((repliedRes.count ?? 0) / sentAndRepliedCount) * 100)
      : null;

  const dailyCap = configRes.data?.daily_send_cap ?? 10;

  let avgScore: number | null = null;
  const avgScoreRows = avgScoreRes.data;
  if (avgScoreRows && avgScoreRows.length > 0) {
    const sum = avgScoreRows.reduce(
      (acc, r) => acc + ((r as { score: number }).score ?? 0),
      0,
    );
    avgScore = Math.round(sum / avgScoreRows.length);
  }

  const funnelCounts: Record<string, number> = {};
  for (const row of funnelRes.data ?? []) {
    const stage = (row as { stage: string }).stage;
    funnelCounts[stage] = (funnelCounts[stage] ?? 0) + 1;
  }

  const funnel = FUNNEL_STAGES.map((stage) => ({
    stage,
    count: funnelCounts[stage] ?? 0,
  })).filter((s) => s.count > 0);

  return {
    replyRate,
    sentToday: sentTodayRes.count ?? 0,
    dailyCap,
    sentThisWeek: sentWeekRes.count ?? 0,
    avgScore,
    funnel,
  };
}
