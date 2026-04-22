"use client";

import { TagInput } from "@/components/tag-input";
import { ReviewFormSection } from "@/components/ui/review-form-section";

// Section 5 of the ICP review. Disqualifiers — hard no's that exclude
// an account even if firmographics + signals look right. Edited as a
// flat string list because the orchestrator's prompt enforces that
// shape (one disqualifier per array entry).

interface ExclusionsProps {
  disqualifiers: string[];
  onDisqualifiersChange: (next: string[]) => void;
}

export function Exclusions({
  disqualifiers,
  onDisqualifiersChange,
}: ExclusionsProps) {
  return (
    <ReviewFormSection title={`Exclusions (${disqualifiers.length})`}>
      <div className="space-y-4">
        <p className="text-xs text-[var(--color-text-muted)]">
          Conditions that disqualify an account. The pipeline will skip anything
          matching these even if other criteria fit.
        </p>
        <TagInput
          values={disqualifiers}
          onChange={onDisqualifiersChange}
          inputId="icp-disqualifiers"
          label="Disqualifiers"
          description="One per entry — short, scannable rules"
          placeholder="Add a disqualifier..."
          itemNoun="disqualifier"
          maxLength={200}
        />
      </div>
    </ReviewFormSection>
  );
}
