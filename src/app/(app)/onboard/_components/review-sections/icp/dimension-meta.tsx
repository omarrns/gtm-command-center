"use client";

import {
  ICP_DIMENSIONS,
  calculateDimensionQuality,
  dominantEvidenceLabel,
  type CoreIcpDimensionKey,
} from "@/lib/onboarding/icp-dimensions";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";

// Right-side header meta for an ICP review section. Shows the live
// completeness fraction (filled / total sub-dims) and the dominant
// evidence-strength label, so the user can scan each section heading
// for "is this filled" + "where did the value come from" without
// drilling into the inputs.
//
// Completeness is computed live from `value` so it tracks user edits in
// real time. Evidence-strength comes from the snapshot the orchestrator
// wrote — editing a value in the form doesn't change its evidence
// strength here (the dashboard's `update-icp-rubric` action handles
// that promotion at save time).

interface DimensionMetaProps {
  dimensionKey: CoreIcpDimensionKey;
  value: unknown;
  evidence?: IcpEdits["evidence"];
}

export function DimensionMeta({
  dimensionKey,
  value,
  evidence,
}: DimensionMetaProps) {
  const config = ICP_DIMENSIONS.find((d) => d.key === dimensionKey);
  if (!config) return null;

  const total = config.subDimensions.length;
  const quality = calculateDimensionQuality(dimensionKey, value);
  const filled = Math.max(0, total - quality.missingFields.length);
  const evidenceLabel = dominantEvidenceLabel(
    dimensionKey,
    evidence?.[dimensionKey],
  );

  return (
    <>
      <span aria-label={`${filled} of ${total} sub-fields filled`}>
        {filled}/{total}
      </span>
      {evidenceLabel && (
        <>
          <span aria-hidden>·</span>
          <span>{evidenceLabel}</span>
        </>
      )}
    </>
  );
}
