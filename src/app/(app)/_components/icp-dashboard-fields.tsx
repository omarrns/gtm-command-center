"use client";

import { Badge } from "@/components/ui/badge";
import { EditableField } from "@/components/ui/editable-field";
import { ReviewFormSection } from "@/components/ui/review-form-section";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";

export interface ArtifactSummary {
  id: string;
  kind: string;
  source_label: string | null;
  source_url: string | null;
  status: string;
}

interface IcpDashboardFieldsProps {
  rubric: IcpRubric;
  onRubricChange: (next: IcpRubric) => void;
  artifacts: ArtifactSummary[];
}

const KIND_LABEL: Record<string, string> = {
  positive_example: "Positive",
  negative_example: "Negative",
  buyer_persona: "Buyer persona",
  company_context: "Context",
};

export function IcpDashboardFields({
  rubric,
  onRubricChange,
  artifacts,
}: IcpDashboardFieldsProps) {
  const persist = onRubricChange;

  function updateProduct<K extends keyof IcpRubric["product"]>(key: K) {
    return (value: string) => {
      persist({ ...rubric, product: { ...rubric.product, [key]: value } });
    };
  }

  function updateBuyer<K extends keyof IcpRubric["buyer"]>(key: K) {
    return (value: string) => {
      persist({ ...rubric, buyer: { ...rubric.buyer, [key]: value } });
    };
  }

  function updateFirmographicsList<
    K extends "industries" | "stages" | "geographies",
  >(key: K) {
    return (value: string[]) => {
      persist({
        ...rubric,
        firmographics: { ...rubric.firmographics, [key]: value },
      });
    };
  }

  function updateEmployeeRange(key: "min" | "max") {
    return (value: string) => {
      const parsed = value.trim() === "" ? null : parseInt(value, 10);
      persist({
        ...rubric,
        firmographics: {
          ...rubric.firmographics,
          employee_range: {
            ...rubric.firmographics.employee_range,
            [key]:
              key === "max" && parsed === null
                ? null
                : Math.max(0, parsed ?? 0),
          },
        },
      });
    };
  }

  function updateTechnographicsList<
    K extends "required_tools" | "excluded_tools",
  >(key: K) {
    return (value: string[]) => {
      persist({
        ...rubric,
        technographics: { ...rubric.technographics, [key]: value },
      });
    };
  }

  function updateTechnographicsText<
    K extends "tech_maturity" | "data_infrastructure",
  >(key: K) {
    return (value: string) => {
      persist({
        ...rubric,
        technographics: { ...rubric.technographics, [key]: value },
      });
    };
  }

  function updateSignals<K extends keyof IcpRubric["signals"]>(key: K) {
    return (value: string[]) => {
      persist({ ...rubric, signals: { ...rubric.signals, [key]: value } });
    };
  }

  function updateDisqualifierList<
    K extends
      | "tech_disqualifiers"
      | "stage_disqualifiers"
      | "behavioral_disqualifiers",
  >(key: K) {
    return (value: string[]) => {
      persist({
        ...rubric,
        disqualifiers: { ...rubric.disqualifiers, [key]: value },
      });
    };
  }

  function updateSizeDisqualifier(value: string) {
    persist({
      ...rubric,
      disqualifiers: { ...rubric.disqualifiers, size_disqualifiers: value },
    });
  }

  function updateProofPoints<K extends keyof IcpRubric["proof_points"]>(
    key: K,
  ) {
    return (value: string[]) => {
      persist({
        ...rubric,
        proof_points: { ...rubric.proof_points, [key]: value },
      });
    };
  }

  return (
    <>
      <ReviewFormSection title="Product">
        <div className="space-y-4">
          <EditableField
            label="Category"
            kind="text"
            value={rubric.product.category}
            onCommit={updateProduct("category")}
          />
          <EditableField
            label="Core JTBD"
            kind="text"
            value={rubric.product.core_jtbd}
            onCommit={updateProduct("core_jtbd")}
          />
          <EditableField
            label="Wedge"
            kind="text"
            value={rubric.product.wedge}
            onCommit={updateProduct("wedge")}
          />
          <EditableField
            label="Delivery model"
            kind="text"
            value={rubric.product.delivery_model}
            onCommit={updateProduct("delivery_model")}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Buyer Roles">
        <div className="space-y-4">
          <EditableField
            label="Economic buyer"
            kind="text"
            value={rubric.buyer.economic_buyer}
            onCommit={updateBuyer("economic_buyer")}
          />
          <EditableField
            label="Champion"
            kind="text"
            value={rubric.buyer.champion}
            onCommit={updateBuyer("champion")}
          />
          <EditableField
            label="End user"
            kind="text"
            value={rubric.buyer.end_user}
            onCommit={updateBuyer("end_user")}
          />
          <EditableField
            label="Deal blocker"
            kind="text"
            value={rubric.buyer.deal_blocker}
            onCommit={updateBuyer("deal_blocker")}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Firmographics">
        <div className="space-y-4">
          <EditableField
            label="Industries"
            kind="list"
            value={rubric.firmographics.industries}
            onCommit={updateFirmographicsList("industries")}
          />
          <EditableField
            label="Business model"
            kind="text"
            value={rubric.firmographics.business_model}
            onCommit={(value) =>
              persist({
                ...rubric,
                firmographics: {
                  ...rubric.firmographics,
                  business_model: value,
                },
              })
            }
          />
          <div className="grid grid-cols-2 gap-4">
            <EditableField
              label="Min employees"
              kind="text"
              value={String(rubric.firmographics.employee_range.min)}
              onCommit={updateEmployeeRange("min")}
            />
            <EditableField
              label="Max employees"
              kind="text"
              value={
                rubric.firmographics.employee_range.max === null
                  ? ""
                  : String(rubric.firmographics.employee_range.max)
              }
              onCommit={updateEmployeeRange("max")}
            />
          </div>
          <EditableField
            label="Stages"
            kind="list"
            value={rubric.firmographics.stages}
            onCommit={updateFirmographicsList("stages")}
          />
          <EditableField
            label="Geographies"
            kind="list"
            value={rubric.firmographics.geographies}
            onCommit={updateFirmographicsList("geographies")}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Technographics">
        <div className="space-y-4">
          <EditableField
            label="Required tools"
            kind="list"
            value={rubric.technographics.required_tools}
            onCommit={updateTechnographicsList("required_tools")}
          />
          <EditableField
            label="Excluded tools"
            kind="list"
            value={rubric.technographics.excluded_tools}
            onCommit={updateTechnographicsList("excluded_tools")}
          />
          <EditableField
            label="Tech maturity"
            kind="text"
            value={rubric.technographics.tech_maturity}
            onCommit={updateTechnographicsText("tech_maturity")}
          />
          <EditableField
            label="Data infrastructure"
            kind="text"
            value={rubric.technographics.data_infrastructure}
            onCommit={updateTechnographicsText("data_infrastructure")}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Signals">
        <div className="space-y-4">
          <EditableField
            label="Hiring roles"
            kind="list"
            value={rubric.signals.hiring_roles}
            onCommit={updateSignals("hiring_roles")}
          />
          <EditableField
            label="JTBD evidence"
            kind="list"
            value={rubric.signals.jtbd_evidence}
            onCommit={updateSignals("jtbd_evidence")}
          />
          <EditableField
            label="Trigger events"
            kind="list"
            value={rubric.signals.trigger_events}
            onCommit={updateSignals("trigger_events")}
          />
          <EditableField
            label="Pain language"
            kind="list"
            value={rubric.signals.pain_language}
            onCommit={updateSignals("pain_language")}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Disqualifiers">
        <div className="space-y-4">
          <EditableField
            label="Tech disqualifiers"
            kind="list"
            value={rubric.disqualifiers.tech_disqualifiers}
            onCommit={updateDisqualifierList("tech_disqualifiers")}
          />
          <EditableField
            label="Size disqualifier"
            kind="text"
            value={rubric.disqualifiers.size_disqualifiers}
            onCommit={updateSizeDisqualifier}
          />
          <EditableField
            label="Stage disqualifiers"
            kind="list"
            value={rubric.disqualifiers.stage_disqualifiers}
            onCommit={updateDisqualifierList("stage_disqualifiers")}
          />
          <EditableField
            label="Behavioral disqualifiers"
            kind="list"
            value={rubric.disqualifiers.behavioral_disqualifiers}
            onCommit={updateDisqualifierList("behavioral_disqualifiers")}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Proof Points">
        <div className="space-y-4">
          <EditableField
            label="Existing customers"
            kind="list"
            value={rubric.proof_points.existing_customers}
            onCommit={updateProofPoints("existing_customers")}
          />
          <EditableField
            label="Won deals"
            kind="list"
            value={rubric.proof_points.won_deals}
            onCommit={updateProofPoints("won_deals")}
          />
          <EditableField
            label="Lost deal reasons"
            kind="list"
            value={rubric.proof_points.lost_deals_reasons}
            onCommit={updateProofPoints("lost_deals_reasons")}
          />
        </div>
      </ReviewFormSection>

      {artifacts.length > 0 && (
        <ReviewFormSection title={`Exemplars (${artifacts.length})`}>
          <div className="space-y-3">
            {artifacts.map((artifact) => {
              const title =
                artifact.source_label ?? artifact.source_url ?? "Untitled";
              return (
                <div key={artifact.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-[var(--color-text)]">{title}</p>
                    <Badge variant="muted">
                      {KIND_LABEL[artifact.kind] ?? artifact.kind}
                    </Badge>
                  </div>
                  {artifact.source_url && (
                    <a
                      href={artifact.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--color-blue)] hover:underline"
                    >
                      {artifact.source_url}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </ReviewFormSection>
      )}
    </>
  );
}
