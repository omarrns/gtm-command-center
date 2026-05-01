export type AccountResearchSummary = {
  recentNews: Array<{
    headline: string;
    relevance: string;
    published_at: string | null;
  }>;
  recentFunding: {
    stage: string;
    amount_usd: number | null;
    closed_at: string | null;
    investors: string[];
  } | null;
  hiringTrajectory: {
    trend: "accelerating" | "steady" | "slowing";
    signal_roles: string[];
    net_30d: number | null;
  } | null;
  competitorMentions: Array<{ competitor: string; context: string }>;
  techStackGaps: string[];
};

export function whyNowLine(research: AccountResearchSummary | undefined): {
  text: string;
  timestamp: string | null;
} | null {
  if (!research) return null;
  const news = research.recentNews?.[0];
  if (news?.headline) {
    const text = news.relevance
      ? `${news.headline} — ${news.relevance}`
      : news.headline;
    return { text, timestamp: news.published_at ?? null };
  }
  const funding = research.recentFunding;
  if (funding?.stage) {
    const amount = funding.amount_usd
      ? ` $${Math.round(funding.amount_usd / 1_000_000)}M`
      : "";
    const investor = funding.investors?.[0]
      ? ` led by ${funding.investors[0]}`
      : "";
    return {
      text: `${funding.stage}${amount}${investor}`,
      timestamp: funding.closed_at,
    };
  }
  const hiring = research.hiringTrajectory;
  if (hiring?.trend === "accelerating" && hiring.signal_roles?.length) {
    return {
      text: `Hiring accelerating: ${hiring.signal_roles.slice(0, 2).join(", ")}`,
      timestamp: null,
    };
  }
  return null;
}

export function tierVariant(
  tier: "A" | "B" | "C",
): "default" | "secondary" | "outline" {
  if (tier === "A") return "default";
  if (tier === "B") return "secondary";
  return "outline";
}

export function verdictColor(verdict: "Pursue" | "Worth exploring" | "Skip") {
  if (verdict === "Pursue") return "var(--color-success)";
  if (verdict === "Worth exploring") return "var(--color-warning)";
  return "var(--color-text-subtle)";
}

export function formatEmployees(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1000) return `${Math.round(n / 100) / 10}k employees`;
  return `${n} employees`;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function contactJobLabel(status: string | undefined): string {
  if (status === "pending") return "Queued";
  if (status === "running") return "Researching contacts";
  return "Starting";
}
