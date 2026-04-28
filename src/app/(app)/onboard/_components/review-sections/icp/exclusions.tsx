"use client";

import { TagInput } from "@/components/tag-input";
import { Input } from "@/components/ui/input";
import { ReviewFormSection } from "@/components/ui/review-form-section";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";
import { DimensionMeta } from "./dimension-meta";

// Section 5 of the ICP review. Disqualifiers — hard no's that exclude
// an account even if firmographics + signals look right.

interface ExclusionsProps {
  disqualifiers: IcpEdits["icp"]["disqualifiers"];
  onDisqualifiersChange: (next: IcpEdits["icp"]["disqualifiers"]) => void;
  evidence?: IcpEdits["evidence"];
}

function countDisqualifiers(
  disqualifiers: IcpEdits["icp"]["disqualifiers"],
): number {
  return (
    disqualifiers.tech_disqualifiers.length +
    (disqualifiers.size_disqualifiers.trim() ? 1 : 0) +
    disqualifiers.stage_disqualifiers.length +
    disqualifiers.behavioral_disqualifiers.length
  );
}

export function Exclusions({
  disqualifiers,
  onDisqualifiersChange,
  evidence,
}: ExclusionsProps) {
  return (
    <ReviewFormSection
      title={`Exclusions (${countDisqualifiers(disqualifiers)})`}
      meta={
        <DimensionMeta
          dimensionKey="disqualifiers"
          value={disqualifiers}
          evidence={evidence}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-[var(--color-text-muted)]">
          Conditions that disqualify an account. The pipeline will skip anything
          matching these even if other criteria fit.
        </p>
        <TagInput
          values={disqualifiers.tech_disqualifiers}
          onChange={(tech_disqualifiers) =>
            onDisqualifiersChange({ ...disqualifiers, tech_disqualifiers })
          }
          inputId="icp-tech-disqualifiers"
          label="Tech disqualifiers"
          description="Tools or stacks that rule out an account"
          placeholder="Add a tech disqualifier..."
          itemNoun="disqualifier"
          maxLength={200}
        />
        <div className="space-y-1.5">
          <label className="text-xs text-[var(--color-text-muted)]">
            Size disqualifier
          </label>
          <Input
            type="text"
            value={disqualifiers.size_disqualifiers}
            onChange={(e) =>
              onDisqualifiersChange({
                ...disqualifiers,
                size_disqualifiers: e.target.value,
              })
            }
            className="border-transparent"
          />
        </div>
        <TagInput
          values={disqualifiers.stage_disqualifiers}
          onChange={(stage_disqualifiers) =>
            onDisqualifiersChange({ ...disqualifiers, stage_disqualifiers })
          }
          inputId="icp-stage-disqualifiers"
          label="Stage disqualifiers"
          description="Company stages that are out of bounds"
          placeholder="Add a stage disqualifier..."
          itemNoun="disqualifier"
          maxLength={200}
        />
        <TagInput
          values={disqualifiers.behavioral_disqualifiers}
          onChange={(behavioral_disqualifiers) =>
            onDisqualifiersChange({
              ...disqualifiers,
              behavioral_disqualifiers,
            })
          }
          inputId="icp-behavioral-disqualifiers"
          label="Behavioral disqualifiers"
          description="Operating patterns or intent signals that rule out an account"
          placeholder="Add a behavioral disqualifier..."
          itemNoun="disqualifier"
          maxLength={200}
        />
      </div>
    </ReviewFormSection>
  );
}
