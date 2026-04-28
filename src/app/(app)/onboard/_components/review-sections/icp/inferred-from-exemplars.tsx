"use client";

import { TagInput } from "@/components/tag-input";
import { Input } from "@/components/ui/input";
import { ReviewFormSection } from "@/components/ui/review-form-section";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";
import { DimensionMeta } from "./dimension-meta";

// Section 2 of the ICP review. Firmographics, technographics, signals,
// and proof points. When positive_example artifacts exist the
// orchestrator pattern-extracts these across them; when none exist
// the fields still accept declarative input. Split into four
// sibling ReviewFormSections — the split gives each dimension its own
// heading and reading rhythm in the document layout.

interface InferredFromExemplarsProps {
  firmographics: IcpEdits["icp"]["firmographics"];
  onFirmographicsChange: (next: IcpEdits["icp"]["firmographics"]) => void;
  technographics: IcpEdits["icp"]["technographics"];
  onTechnographicsChange: (next: IcpEdits["icp"]["technographics"]) => void;
  signals: IcpEdits["icp"]["signals"];
  onSignalsChange: (next: IcpEdits["icp"]["signals"]) => void;
  proofPoints: IcpEdits["proof_points"];
  onProofPointsChange: (next: IcpEdits["proof_points"]) => void;
  positiveExemplarCount: number;
  evidence?: IcpEdits["evidence"];
}

export function InferredFromExemplars({
  firmographics,
  onFirmographicsChange,
  technographics,
  onTechnographicsChange,
  signals,
  onSignalsChange,
  proofPoints,
  onProofPointsChange,
  positiveExemplarCount,
  evidence,
}: InferredFromExemplarsProps) {
  return (
    <>
      {positiveExemplarCount === 0 && (
        <p className="text-xs text-[var(--color-text-muted)] mb-8">
          No positive exemplars yet — these fields are declarative. Add 3+
          customers you&apos;d want more of to switch to pattern-extracted
          inference.
        </p>
      )}

      <ReviewFormSection
        title="Firmographics"
        meta={
          <DimensionMeta
            dimensionKey="firmographics"
            value={firmographics}
            evidence={evidence}
          />
        }
      >
        <div className="space-y-5">
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
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-text-muted)]">
              Business model
            </label>
            <Input
              type="text"
              value={firmographics.business_model}
              onChange={(e) =>
                onFirmographicsChange({
                  ...firmographics,
                  business_model: e.target.value,
                })
              }
              className="border-transparent"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--color-text-muted)]">
                Min employees
              </label>
              <Input
                type="number"
                min={0}
                value={firmographics.employee_range.min}
                onChange={(e) =>
                  onFirmographicsChange({
                    ...firmographics,
                    employee_range: {
                      ...firmographics.employee_range,
                      min: Math.max(0, parseInt(e.target.value) || 0),
                    },
                  })
                }
                className="border-transparent"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--color-text-muted)]">
                Max employees
              </label>
              <Input
                type="number"
                min={0}
                value={firmographics.employee_range.max ?? ""}
                onChange={(e) =>
                  onFirmographicsChange({
                    ...firmographics,
                    employee_range: {
                      ...firmographics.employee_range,
                      max:
                        e.target.value.trim() === ""
                          ? null
                          : Math.max(0, parseInt(e.target.value) || 0),
                    },
                  })
                }
                className="border-transparent"
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
      </ReviewFormSection>

      <ReviewFormSection
        title="Technographics"
        meta={
          <DimensionMeta
            dimensionKey="technographics"
            value={technographics}
            evidence={evidence}
          />
        }
      >
        <div className="space-y-5">
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
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-text-muted)]">
              Tech maturity
            </label>
            <Input
              type="text"
              value={technographics.tech_maturity}
              onChange={(e) =>
                onTechnographicsChange({
                  ...technographics,
                  tech_maturity: e.target.value,
                })
              }
              className="border-transparent"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-text-muted)]">
              Data infrastructure
            </label>
            <Input
              type="text"
              value={technographics.data_infrastructure}
              onChange={(e) =>
                onTechnographicsChange({
                  ...technographics,
                  data_infrastructure: e.target.value,
                })
              }
              className="border-transparent"
            />
          </div>
        </div>
      </ReviewFormSection>

      <ReviewFormSection
        title="Signals"
        meta={
          <DimensionMeta
            dimensionKey="signals"
            value={signals}
            evidence={evidence}
          />
        }
      >
        <div className="space-y-5">
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
          <TagInput
            values={signals.pain_language}
            onChange={(pain_language) =>
              onSignalsChange({ ...signals, pain_language })
            }
            inputId="icp-pain-language"
            label="Pain language"
            description="Words buyers use to describe the problem"
            placeholder="Add pain language..."
            itemNoun="phrase"
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Proof Points">
        <div className="space-y-5">
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
    </>
  );
}
