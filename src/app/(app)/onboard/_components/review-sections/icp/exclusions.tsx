"use client";

import { TagInput } from "@/components/tag-input";
import { SectionHeader } from "../../section-header";

// Section 5 of the ICP review. Disqualifiers — hard no's that exclude
// an account even if firmographics + signals look right. Edited as a
// flat string list because the orchestrator's prompt enforces that
// shape (one disqualifier per array entry).

interface ExclusionsProps {
  isExpanded: boolean;
  onToggle: () => void;
  disqualifiers: string[];
  onDisqualifiersChange: (next: string[]) => void;
}

export function Exclusions({
  isExpanded,
  onToggle,
  disqualifiers,
  onDisqualifiersChange,
}: ExclusionsProps) {
  return (
    <div className="surface p-5 mb-4">
      <SectionHeader
        title={`Exclusions (${disqualifiers.length})`}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <div className="space-y-3 mt-2">
          <p className="text-xs text-[var(--color-text-muted)]">
            Conditions that disqualify an account. The pipeline will skip
            anything matching these even if other criteria fit.
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
      )}
    </div>
  );
}
