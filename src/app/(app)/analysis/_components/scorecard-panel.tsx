"use client";

import { cn } from "@/lib/utils";

interface ScorecardDimension {
  score: number;
  justification: string;
}

interface ScorecardProps {
  scorecard: Record<string, ScorecardDimension>;
  totalScore: number;
  maxScore: number;
  verdict: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  years_seniority: "Years & Seniority",
  core_responsibilities: "Core Responsibilities",
  technical_requirements: "Technical Requirements",
  industry_domain: "Industry & Domain",
  outcome_evidence: "Outcome Evidence",
  soft_skills: "Soft Skills & Culture",
  gap_risk: "Gap Risk",
  market_familiarity: "Market Familiarity",
  product_adjacency: "Product Adjacency",
  gtm_motion_match: "GTM Motion Match",
  ai_technical_edge: "AI/Technical Edge",
  founder_alignment: "Founder Alignment",
  stage_match: "Stage Match",
};

function scoreColor(score: number): string {
  if (score >= 4) return "text-[var(--color-success)]";
  if (score >= 3) return "text-[var(--color-warning)]";
  return "text-[var(--color-danger)]";
}

function verdictBadge(verdict: string) {
  const lower = verdict.toLowerCase();
  if (lower.includes("strong") || lower.includes("pursue"))
    return "badge-success";
  if (lower.includes("stretch") || lower.includes("skip"))
    return "badge-danger";
  return "badge-warning";
}

export function ScorecardPanel({
  scorecard,
  totalScore,
  maxScore,
  verdict,
}: ScorecardProps) {
  return (
    <div className="surface p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold">Scorecard</h3>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tabular-nums">
            {totalScore}
            <span className="text-sm font-normal text-[var(--color-text-muted)]">
              /{maxScore}
            </span>
          </span>
          <span className={`badge ${verdictBadge(verdict)}`}>{verdict}</span>
        </div>
      </div>
      <div className="space-y-3">
        {Object.entries(scorecard).map(([key, dim]) => (
          <div key={key} className="flex items-start gap-3">
            <div className="w-5 flex-shrink-0 text-right">
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  scoreColor(dim.score),
                )}
              >
                {dim.score}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium">
                {DIMENSION_LABELS[key] ?? key}
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
                {dim.justification}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
