"use client";

import { ReviewFormSection } from "@/components/ui/review-form-section";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";

// Section 3 of the ICP review. Read-only. Surfaces the orchestrator's
// per-dimension summary for the four exemplar-derived dimensions
// (firmographics / technographics / signals / proof_points). Each
// summary is one sentence the orchestrator wrote when it consolidated
// the pattern across positive_examples — the user reads it as
// "here's what showed up across most of your customers."
//
// Hidden when fewer than 3 positive exemplars exist (a single example
// is not a pattern). The parent enforces this.

const PATTERN_DIMENSIONS = [
  { key: "firmographics", label: "Firmographics" },
  { key: "technographics", label: "Technographics" },
  { key: "signals", label: "Signals" },
  { key: "proof_points", label: "Proof points" },
];

interface CommonPatternsProps {
  orchestratorState: OrchestratorState | null;
  positiveExemplarCount: number;
}

export function CommonPatterns({
  orchestratorState,
  positiveExemplarCount,
}: CommonPatternsProps) {
  if (!orchestratorState) return null;

  const rows = PATTERN_DIMENSIONS.map((d) => ({
    ...d,
    summary: orchestratorState.dimensions[d.key]?.summary ?? "",
  })).filter((r) => r.summary.length > 0);

  if (rows.length === 0) return null;

  return (
    <ReviewFormSection
      title={`Common Patterns (${positiveExemplarCount} exemplars)`}
    >
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.key} className="space-y-1">
            <p className="text-xs text-[var(--color-text-muted)]">{r.label}</p>
            <p className="text-sm">{r.summary}</p>
          </div>
        ))}
      </div>
    </ReviewFormSection>
  );
}
