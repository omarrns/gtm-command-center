"use client";

import { TagInput } from "@/components/tag-input";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "../../section-header";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";

// Section 2 of the ICP review. Firmographics, technographics, signals,
// and proof points are pattern-extracted across positive_example
// artifacts. When zero positives were uploaded the orchestrator
// degenerates to declarative-only mode and these fields are typically
// empty defaults — the parent hides this section in that case.

interface InferredFromExemplarsProps {
  isExpanded: boolean;
  onToggle: () => void;
  firmographics: IcpEdits["icp"]["firmographics"];
  onFirmographicsChange: (next: IcpEdits["icp"]["firmographics"]) => void;
  technographics: IcpEdits["icp"]["technographics"];
  onTechnographicsChange: (next: IcpEdits["icp"]["technographics"]) => void;
  signals: IcpEdits["icp"]["signals"];
  onSignalsChange: (next: IcpEdits["icp"]["signals"]) => void;
  proofPoints: IcpEdits["proof_points"];
  onProofPointsChange: (next: IcpEdits["proof_points"]) => void;
  positiveExemplarCount: number;
}

export function InferredFromExemplars({
  isExpanded,
  onToggle,
  firmographics,
  onFirmographicsChange,
  technographics,
  onTechnographicsChange,
  signals,
  onSignalsChange,
  proofPoints,
  onProofPointsChange,
  positiveExemplarCount,
}: InferredFromExemplarsProps) {
  return (
    <div className="surface p-5 mb-4">
      <SectionHeader
        title={`Inferred from exemplars (${positiveExemplarCount})`}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <div className="space-y-5 mt-2">
          <div className="space-y-3">
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
              Firmographics
            </p>
            <TagInput
              values={firmographics.industries}
              onChange={(industries) =>
                onFirmographicsChange({ ...firmographics, industries })
              }
              inputId="icp-industries"
              label="Industries"
              description="Verticals you sell into (max 10)"
              placeholder="Add an industry..."
              itemNoun="industry"
              itemNounPlural="industries"
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Min employees</label>
                <Input
                  type="number"
                  min={0}
                  value={firmographics.employee_range_min}
                  onChange={(e) =>
                    onFirmographicsChange({
                      ...firmographics,
                      employee_range_min: Math.max(
                        0,
                        parseInt(e.target.value) || 0,
                      ),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Max employees</label>
                <Input
                  type="number"
                  min={0}
                  value={firmographics.employee_range_max}
                  onChange={(e) =>
                    onFirmographicsChange({
                      ...firmographics,
                      employee_range_max: Math.max(
                        0,
                        parseInt(e.target.value) || 0,
                      ),
                    })
                  }
                />
              </div>
            </div>
            <TagInput
              values={firmographics.stages}
              onChange={(stages) =>
                onFirmographicsChange({ ...firmographics, stages })
              }
              inputId="icp-stages"
              label="Stages"
              description="Company maturity stages (e.g. seed, series A)"
              placeholder="Add a stage..."
              itemNoun="stage"
            />
            <TagInput
              values={firmographics.geographies}
              onChange={(geographies) =>
                onFirmographicsChange({ ...firmographics, geographies })
              }
              inputId="icp-geos"
              label="Geographies"
              description="Regions you sell into"
              placeholder="Add a geography..."
              itemNoun="geography"
              itemNounPlural="geographies"
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
              Technographics
            </p>
            <TagInput
              values={technographics.required_tools}
              onChange={(required_tools) =>
                onTechnographicsChange({ ...technographics, required_tools })
              }
              inputId="icp-required-tools"
              label="Required tools"
              description="Stacks your buyers must already use"
              placeholder="Add a required tool..."
              itemNoun="tool"
            />
            <TagInput
              values={technographics.excluded_tools}
              onChange={(excluded_tools) =>
                onTechnographicsChange({ ...technographics, excluded_tools })
              }
              inputId="icp-excluded-tools"
              label="Excluded tools"
              description="Stacks that disqualify the account"
              placeholder="Add an excluded tool..."
              itemNoun="tool"
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
              Signals
            </p>
            <TagInput
              values={signals.hiring_roles}
              onChange={(hiring_roles) =>
                onSignalsChange({ ...signals, hiring_roles })
              }
              inputId="icp-hiring-roles"
              label="Hiring roles"
              description="Job titles whose hiring posts indicate fit"
              placeholder="Add a role..."
              itemNoun="role"
            />
            <TagInput
              values={signals.jtbd_evidence}
              onChange={(jtbd_evidence) =>
                onSignalsChange({ ...signals, jtbd_evidence })
              }
              inputId="icp-jtbd"
              label="JTBD evidence"
              description="Phrases / patterns that reveal active pain"
              placeholder="Add JTBD evidence..."
              itemNoun="phrase"
            />
            <TagInput
              values={signals.trigger_events}
              onChange={(trigger_events) =>
                onSignalsChange({ ...signals, trigger_events })
              }
              inputId="icp-triggers"
              label="Trigger events"
              description="Events that put an account into-buying-mode"
              placeholder="Add a trigger event..."
              itemNoun="event"
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
              Proof points
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
        </div>
      )}
    </div>
  );
}
