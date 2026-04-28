"use client";

import { TagInput } from "@/components/tag-input";
import { ReviewFormSection } from "@/components/ui/review-form-section";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";

// Proof Points are evidence/calibration: they explain WHERE the ICP
// came from (existing customers, won deals, lost-deal patterns) rather
// than describing the ICP itself. Phase 2 dropped proof_points from
// the core ICP dimensions; the Phase 4 plan said to "keep proof points
// visible as evidence/calibration, not inside the core ICP definition
// section." Phase 8 makes that explicit by extracting this section
// out of `inferred-from-exemplars.tsx` (where it sat next to
// firmographics/technographics/signals as if it were a peer dimension)
// and placing it below the core rubric so the reader sees it as
// supporting material.

interface ProofPointsCalibrationProps {
  proofPoints: IcpEdits["proof_points"];
  onProofPointsChange: (next: IcpEdits["proof_points"]) => void;
}

export function ProofPointsCalibration({
  proofPoints,
  onProofPointsChange,
}: ProofPointsCalibrationProps) {
  return (
    <ReviewFormSection title="Proof Points (calibration)">
      <div className="space-y-5">
        <p className="text-xs text-[var(--color-text-muted)]">
          These don&apos;t define your ICP — they explain where it came from.
          Reference customers, won deals, and lost-deal patterns the
          orchestrator + scorer can quote when explaining a fit.
        </p>
        <TagInput
          values={proofPoints.existing_customers}
          onChange={(existing_customers) =>
            onProofPointsChange({ ...proofPoints, existing_customers })
          }
          inputId="icp-customers"
          label="Existing customers"
          description="Names you'd reference in outreach"
          placeholder="Add a customer..."
          itemNoun="customer"
        />
        <TagInput
          values={proofPoints.won_deals}
          onChange={(won_deals) =>
            onProofPointsChange({ ...proofPoints, won_deals })
          }
          inputId="icp-won"
          label="Won deals"
          description="Deals worth quoting in case studies"
          placeholder="Add a won deal..."
          itemNoun="deal"
        />
        <TagInput
          values={proofPoints.lost_deals_reasons}
          onChange={(lost_deals_reasons) =>
            onProofPointsChange({ ...proofPoints, lost_deals_reasons })
          }
          inputId="icp-lost"
          label="Lost deal reasons"
          description="Patterns from lost deals — informs disqualifiers"
          placeholder="Add a reason..."
          itemNoun="reason"
        />
      </div>
    </ReviewFormSection>
  );
}
