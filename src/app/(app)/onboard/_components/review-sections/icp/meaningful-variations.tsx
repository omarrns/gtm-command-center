"use client";

import { SectionHeader } from "../../section-header";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";

// Section 4 of the ICP review. Display-only — never written to the
// rubric. Surfaces dimensions where the orchestrator's confidence
// stayed below threshold even after consolidation. Low confidence
// here is the "meaningful variation" signal: the exemplars didn't
// agree, so the orchestrator couldn't pick a clean value.
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
}

export function MeaningfulVariations({
  isExpanded,
  onToggle,
  orchestratorState,
}: MeaningfulVariationsProps) {
  if (!orchestratorState) return null;

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
