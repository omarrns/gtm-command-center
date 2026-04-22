"use client";

import { SectionHeader } from "../../section-header";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";

// Section 4 of the ICP review. Display-only — never written to the
// rubric. Surfaces dimensions where the orchestrator's confidence
// stayed below threshold even after consolidation. With 3+ positive
// exemplars, low confidence means "the exemplars disagreed" — a real
// variation signal. With 1-2 positives the exemplar-scarcity clamp
// deliberately holds confidence at 0.6, so below-threshold is just
// scarcity, not variation. The parent hides this section when
// positiveExemplarCount < 3 to avoid false warnings.
//
// We deliberately don't try to enumerate per-exemplar values — the
// orchestrator emits one synthesized value per dimension. The
// per-exemplar breakdown section gives the raw artifacts for users
// who want to dig in.

const VARIATION_DIMENSIONS = [
  { key: "firmographics", label: "Firmographics" },
  { key: "technographics", label: "Technographics" },
  { key: "signals", label: "Signals" },
  { key: "proof_points", label: "Proof points" },
];

interface MeaningfulVariationsProps {
  isExpanded: boolean;
  onToggle: () => void;
  orchestratorState: OrchestratorState | null;
  positiveExemplarCount: number;
}

export function MeaningfulVariations({
  isExpanded,
  onToggle,
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
    <div className="surface p-5 mb-4">
      <SectionHeader
        title={`Meaningful variations (${variations.length})`}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <div className="mt-2 space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            These dimensions didn&apos;t consolidate cleanly across your
            exemplars. They aren&apos;t blocked from confirm — but you may want
            to revisit them or add more examples.
          </p>
          {variations.map((v) => (
            <div key={v.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
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
      )}
    </div>
  );
}
