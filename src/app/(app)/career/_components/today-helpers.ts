import type { OpportunityStage } from "@/lib/supabase/types";

export interface DashboardMetrics {
  replyRate: number | null;
  sentToday: number;
  dailyCap: number;
  sentThisWeek: number;
  avgScore: number | null;
  funnel: { stage: OpportunityStage; count: number }[];
}

export type DiscoveredWindow = "all" | "today" | "3d" | "7d";

export const WINDOW_MS: Record<DiscoveredWindow, number> = {
  all: Infinity,
  today: 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export const WINDOW_OPTIONS: { value: DiscoveredWindow; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "3d", label: "3d" },
  { value: "7d", label: "7d" },
];

export function sentTodayColor(sent: number, cap: number): string {
  if (cap === 0) return "";
  const ratio = sent / cap;
  if (ratio >= 1) return "text-[var(--color-success)]";
  if (ratio >= 0.7) return "text-[var(--color-warning)]";
  // Nothing sent yet — mute the zero so it doesn't read as a positive signal
  if (sent === 0) return "text-[var(--color-text-muted)]";
  return "";
}

export function scoreAvgColor(avg: number, threshold: number): string {
  if (avg >= 80) return "text-[var(--color-text)]";
  if (avg >= threshold) return "text-[var(--color-blue)]";
  return "";
}
