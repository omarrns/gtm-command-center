"use client";

import { ReviewFormSection } from "@/components/ui/review-form-section";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";

// Section 4 of the ICP review. Display-only — never written to the
// rubric. Surfaces dimensions whose computed completeness stayed below
// threshold even after consolidation. With 3+ positive exemplars, low
// completeness means the pattern is incomplete or varied enough to
// revisit. The parent hides this section when positiveExemplarCount < 3
// because evidence scarcity is already explained by the banner.

const VARIATION_DIMENSIONS = [
  { key: "firmographics", label: "Firmographics" },
  { key: "technographics", label: "Technographics" },
  { key: "signals", label: "Signals" },
];

interface MeaningfulVariationsProps {
  orchestratorState: OrchestratorState | null;
  positiveExemplarCount: number;
}

export function MeaningfulVariations({
  orchestratorState,
  positiveExemplarCount,
}: MeaningfulVariationsProps) {
  if (!orchestratorState) return null;
  if (positiveExemplarCount < 3) return null;

  const variations = VARIATION_DIMENSIONS.map((d) => {
    const dim = orchestratorState.dimensions[d.key];
    if (!dim) return null;
    if (dim.confidence >= dim.threshold) return null;
    return { ...d, summary: dim.summary, confidence: dim.confidence };
  }).filter((v): v is NonNullable<typeof v> => v !== null);

  if (variations.length === 0) return null;

  return (
    <ReviewFormSection title={`Meaningful Variations (${variations.length})`}>
      <div className="space-y-4">
        <p className="text-xs text-[var(--color-text-muted)]">
          These dimensions didn&apos;t consolidate cleanly across your
          exemplars. They aren&apos;t blocked from confirm — but you may want to
          revisit them or add more examples.
        </p>
        {variations.map((v) => (
          <div key={v.key} className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--color-text-muted)]">
                {v.label}
              </p>
              <span className="text-[10px] text-[var(--color-text-subtle)]">
                {Math.round(v.confidence * 100)}% confidence
              </span>
            </div>
            <p className="text-sm">{v.summary}</p>
          </div>
        ))}
      </div>
    </ReviewFormSection>
  );
}
