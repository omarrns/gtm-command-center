import { Badge, type badgeVariants } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

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

function verdictVariant(verdict: string): BadgeVariant {
  const lower = verdict.toLowerCase();
  if (lower.includes("strong") || lower.includes("pursue")) return "success";
  if (lower.includes("stretch") || lower.includes("skip")) return "destructive";
  return "warning";
}

export function ScorecardPanel({
  scorecard,
  totalScore,
  maxScore,
  verdict,
}: ScorecardProps) {
  return (
    <Card className="gap-5 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Scorecard
        </h3>
        <div className="flex items-center gap-3">
          <span
            className={`text-2xl font-bold tabular-nums ${scoreColor(Math.round((totalScore / maxScore) * 5))}`}
          >
            {totalScore}
            <span className="text-sm font-normal text-[var(--color-text-muted)]">
              /{maxScore}
            </span>
          </span>
          <Badge variant={verdictVariant(verdict)}>{verdict}</Badge>
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
    </Card>
  );
}
